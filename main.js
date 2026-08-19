/* Weread Reading Dashboard · Desktop Release 1.0.0 source entry
 * Runtime modules and managed templates are assembled at build time.
 * Release version is injected from manifest.json; do not hand-edit dist/main.js.
 */
"use strict";

const __WRD_SYNC_EXPORTS = (() => {
  const module = { exports: {} };
  const exports = module.exports;
  ((module, exports, require) => {
/* Weread Reading Dashboard local private build. Generated file. */
const __wrd_modules = {
"api/agent-client.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentClient = void 0;
const obsidian_1 = require("obsidian");
const constants_1 = __wrd_require("constants.js");
const errors_1 = __wrd_require("api/errors.js");
const utils_1 = __wrd_require("utils.js");
class AgentClient {
    constructor(getApiKey, maxRetries = constants_1.REQUEST_RETRY_DELAYS_MS.length) {
        this.getApiKey = getApiKey;
        this.maxRetries = maxRetries;
        this.upgradeInfo = null;
        this.warnings = [];
        this.byApi = {};
        this.events = [];
    }
    async call(apiName, params = {}) {
        const key = this.getApiKey();
        if (!key)
            throw new errors_1.WereadApiError("尚未配置微信读书 API Key。", null, null, false);
        const body = { api_name: apiName, skill_version: constants_1.WEREAD_SKILL_VERSION, ...params };
        const bookId = normalizeBookId(params.bookId ?? params.bookid);
        const row = this.row(apiName);
        row.calls += 1;
        const maxAttempts = this.maxRetries + 1;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const started = Date.now();
            row.attempts += 1;
            try {
                const payload = await this.callOnce(key, apiName, body);
                row.successes += 1;
                if (attempt > 1) {
                    this.recordEvent({
                        apiName, bookId, attempt, maxAttempts, outcome: "success", status: 200, errcode: null,
                        retryable: false, durationMs: Date.now() - started, at: new Date().toISOString(),
                        message: `第 ${attempt} 次尝试成功。`,
                    });
                }
                return payload;
            }
            catch (rawError) {
                const error = normalizeApiError(rawError).withAttempts(attempt);
                const statusKey = error.status === null ? (error.errcode === null ? "network" : `errcode:${error.errcode}`) : String(error.status);
                row.statuses[statusKey] = (row.statuses[statusKey] ?? 0) + 1;
                const canRetry = error.retryable && attempt < maxAttempts;
                if (canRetry) {
                    row.retries += 1;
                    const nextDelayMs = retryDelay(attempt);
                    this.recordEvent({
                        apiName, bookId, attempt, maxAttempts, outcome: "retry", status: error.status, errcode: error.errcode,
                        retryable: true, durationMs: Date.now() - started, at: new Date().toISOString(), message: error.message, nextDelayMs,
                    });
                    await (0, utils_1.sleep)(nextDelayMs);
                    continue;
                }
                row.failures += 1;
                this.recordEvent({
                    apiName, bookId, attempt, maxAttempts, outcome: "failed", status: error.status, errcode: error.errcode,
                    retryable: error.retryable, durationMs: Date.now() - started, at: new Date().toISOString(), message: error.message,
                });
                throw error;
            }
        }
        throw new errors_1.WereadApiError("请求重试状态异常。", null, null, false, maxAttempts);
    }
    getDiagnostics() {
        const byApi = {};
        for (const [apiName, row] of Object.entries(this.byApi)) {
            byApi[apiName] = { ...row, statuses: { ...row.statuses } };
        }
        return {
            generatedAt: new Date().toISOString(),
            maxRetries: this.maxRetries,
            retryDelaysMs: [...constants_1.REQUEST_RETRY_DELAYS_MS],
            totalCalls: Object.values(byApi).reduce((sum, row) => sum + row.calls, 0),
            totalAttempts: Object.values(byApi).reduce((sum, row) => sum + row.attempts, 0),
            byApi,
            events: [...this.events],
        };
    }
    getTotalAttempts() {
        return Object.values(this.byApi).reduce((sum, row) => sum + row.attempts, 0);
    }
    row(apiName) {
        return this.byApi[apiName] ?? (this.byApi[apiName] = {
            calls: 0, attempts: 0, retries: 0, successes: 0, failures: 0, statuses: {},
        });
    }
    recordEvent(event) {
        this.events.push(event);
        if (this.events.length > 500)
            this.events.splice(0, this.events.length - 500);
    }
    async callOnce(key, apiName, body) {
        let response;
        try {
            response = await (0, obsidian_1.requestUrl)({
                url: constants_1.WEREAD_GATEWAY,
                method: "POST",
                contentType: "application/json",
                headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
                body: JSON.stringify(body),
                throw: false,
            });
        }
        catch (error) {
            throw new errors_1.WereadApiError(`网络请求失败：${error instanceof Error ? error.message : String(error)}`, null, null, true);
        }
        if (response.status < 200 || response.status >= 300) {
            const authFailure = response.status === 401 || response.status === 403;
            throw new errors_1.WereadApiError(authFailure
                ? `微信读书 API Key 未通过网关鉴权或无权限（HTTP ${response.status}）。请重新获取有效的 wrk-... Key 后再试。`
                : `微信读书网关返回 HTTP ${response.status}`, response.status, null, response.status === 429 || response.status === 499 || response.status >= 500);
        }
        let json;
        try {
            json = response.json ?? JSON.parse(response.text);
        }
        catch {
            throw new errors_1.WereadApiError("微信读书网关返回了无法解析的 JSON。", response.status, null, false);
        }
        if (json.upgrade_info) {
            this.upgradeInfo = json.upgrade_info;
            const message = json.upgrade_info?.message || json.upgrade_info?.msg || "微信读书同步协议需要升级，请更新插件后重新同步。";
            const error = new errors_1.WereadApiError(message, response.status, null, false);
            error.code = "WRD_SKILL_UPGRADE_REQUIRED";
            error.upgradeInfo = json.upgrade_info;
            throw error;
        }
        const errcode = Number(json.errcode ?? 0);
        if (Number.isFinite(errcode) && errcode !== 0) {
            throw new errors_1.WereadApiError(json.errmsg || `微信读书接口错误 ${errcode}`, response.status, errcode, errcode === -2010 || errcode === 429 || errcode === 499);
        }
        return (json.data ?? json.result ?? json);
    }
}
exports.AgentClient = AgentClient;
function normalizeApiError(error) {
    if (error instanceof errors_1.WereadApiError)
        return error;
    return new errors_1.WereadApiError(error instanceof Error ? error.message : String(error), null, null, true);
}
function retryDelay(retryNumber) {
    const base = constants_1.REQUEST_RETRY_DELAYS_MS[Math.max(0, Math.min(constants_1.REQUEST_RETRY_DELAYS_MS.length - 1, retryNumber - 1))] ?? 8000;
    return base + Math.floor(Math.random() * 401);
}
function normalizeBookId(value) { const text = String(value ?? "").trim(); return text || null; }

},
"api/errors.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WereadApiError = void 0;
class WereadApiError extends Error {
    constructor(message, status = null, errcode = null, retryable = false, attempts = 1) {
        super(message);
        this.status = status;
        this.errcode = errcode;
        this.retryable = retryable;
        this.attempts = attempts;
        this.name = "WereadApiError";
    }
    withAttempts(attempts) {
        const next = new WereadApiError(this.message, this.status, this.errcode, this.retryable, attempts);
        if (this.code !== undefined) next.code = this.code;
        if (this.upgradeInfo !== undefined) next.upgradeInfo = this.upgradeInfo;
        if (this.cause !== undefined) next.cause = this.cause;
        return next;
    }
}
exports.WereadApiError = WereadApiError;

},
"api/pagination.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAllNotebooks = fetchAllNotebooks;
exports.fetchAllReviews = fetchAllReviews;
async function fetchAllNotebooks(client, count = 100, maxPages = 100) {
    const items = [];
    const warnings = [];
    const seen = new Set();
    let lastSort;
    let emptyPages = 0;
    for (let page = 0; page < maxPages; page++) {
        const params = { count };
        if (lastSort !== undefined)
            params.lastSort = lastSort;
        const payload = await client.call("/user/notebooks", params);
        const books = Array.isArray(payload.books) ? payload.books : [];
        items.push(...books);
        emptyPages = books.length ? 0 : emptyPages + 1;
        if (!Number(payload.hasMore))
            return { items, complete: true, warnings };
        const next = Number((books.length ? books[books.length - 1]?.sort : undefined) ?? payload.lastSort);
        if (!Number.isFinite(next)) {
            warnings.push({ code: "notebooks-no-cursor", message: "笔记本概览缺少下一页游标。" });
            return { items, complete: false, warnings };
        }
        const token = String(next);
        if (seen.has(token)) {
            warnings.push({ code: "notebooks-repeat-cursor", message: "笔记本概览分页游标重复，已停止。", context: { apiName: "/user/notebooks", cursor: token } });
            return { items, complete: false, warnings };
        }
        seen.add(token);
        lastSort = next;
        if (emptyPages >= 2) {
            warnings.push({ code: "notebooks-empty-pages", message: "笔记本概览连续返回空页，已停止。" });
            return { items, complete: false, warnings };
        }
    }
    warnings.push({ code: "notebooks-page-limit", message: "笔记本概览达到分页上限，结果可能不完整。" });
    return { items, complete: false, warnings };
}
async function fetchAllReviews(client, bookId, count = 100, maxPages = 100) {
    const items = [];
    const warnings = [];
    const seen = new Set();
    let synckey = 0;
    let emptyPages = 0;
    for (let page = 0; page < maxPages; page++) {
        const payload = await client.call("/review/list/mine", { bookid: bookId, synckey, count });
        const rows = Array.isArray(payload.reviews) ? payload.reviews : [];
        items.push(...rows);
        emptyPages = rows.length ? 0 : emptyPages + 1;
        if (!Number(payload.hasMore))
            return { items, complete: true, warnings };
        const next = Number(payload.synckey);
        if (!Number.isFinite(next)) {
            warnings.push({ code: "book-review-no-cursor", message: `《${bookId}》想法分页缺少游标。` });
            return { items, complete: false, warnings };
        }
        const token = String(next);
        if (seen.has(token)) {
            warnings.push({ code: "book-review-repeat-cursor", message: `《${bookId}》想法分页游标重复。` });
            return { items, complete: false, warnings };
        }
        seen.add(token);
        synckey = next;
        if (emptyPages >= 2) {
            warnings.push({ code: "book-review-empty-pages", message: `《${bookId}》想法连续空页。` });
            return { items, complete: false, warnings };
        }
    }
    warnings.push({ code: "book-review-page-limit", message: `《${bookId}》想法达到分页上限。` });
    return { items, complete: false, warnings };
}

},
"cache/cache-manager.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheManager = void 0;
const obsidian_1 = require("obsidian");
const utils_1 = __wrd_require("utils.js");
const constants_1 = __wrd_require("constants.js");
const DEFAULT_INDEX = { schemaVersion: 1, fetchedAt: {}, shelfSignatures: {}, noteSignatures: {}, progressSignatures: {}, bookFetchedAt: {}, retryQueue: {}, shelfDeletionCandidates: {} };
class CacheManager {
    constructor(app) {
        this.app = app;
        this.root = (0, obsidian_1.normalizePath)(`${app.vault.configDir}/plugins/${constants_1.PLUGIN_ID}/cache`);
    }
    async init() {
        for (const path of [this.root, `${this.root}/books`, `${this.root}/progress`, `${this.root}/notes`, `${this.root}/stats/weeks`, `${this.root}/stats/months`, `${this.root}/stats/years`, `${this.root}/diagnostics`])
            await (0, utils_1.ensureDir)(this.app.vault.adapter, path);
    }
    path(relative) { return (0, obsidian_1.normalizePath)(`${this.root}/${relative}`); }
    async readJson(relative, fallback) {
        const path = this.path(relative);
        try {
            if (!(await this.app.vault.adapter.exists(path)))
                return fallback;
            return JSON.parse(await this.app.vault.adapter.read(path));
        }
        catch {
            return fallback;
        }
    }
    async writeJson(relative, value) {
        const path = this.path(relative);
        const parent = path.split("/").slice(0, -1).join("/");
        await (0, utils_1.ensureDir)(this.app.vault.adapter, parent);
        const tmp = `${path}.tmp`;
        await this.app.vault.adapter.write(tmp, JSON.stringify(value, null, 2));
        if (await this.app.vault.adapter.exists(path))
            await this.app.vault.adapter.remove(path);
        await this.app.vault.adapter.rename(tmp, path);
    }
    async loadIndex() {
        const loaded = await this.readJson("index.json", {});
        return {
            ...DEFAULT_INDEX,
            ...loaded,
            fetchedAt: { ...(loaded.fetchedAt ?? {}) },
            shelfSignatures: { ...(loaded.shelfSignatures ?? {}) },
            noteSignatures: { ...(loaded.noteSignatures ?? {}) },
            progressSignatures: { ...(loaded.progressSignatures ?? {}) },
            bookFetchedAt: { ...(loaded.bookFetchedAt ?? {}) },
            retryQueue: { ...(loaded.retryQueue ?? {}) },
            shelfDeletionCandidates: { ...(loaded.shelfDeletionCandidates ?? {}) },
        };
    }
    async saveIndex(index) { await this.writeJson("index.json", index); }
}
exports.CacheManager = CacheManager;

},
"cache/signatures.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shelfSignature = shelfSignature;
exports.progressSignature = progressSignature;
exports.noteSignature = noteSignature;
const utils_1 = __wrd_require("utils.js");
const progress_fields_1 = __wrd_require("data/progress-fields.js");
function shelfSignature(book) { return (0, utils_1.fnv1a)({ bookId: book?.bookId, updateTime: book?.updateTime, readUpdateTime: book?.readUpdateTime, finishReading: book?.finishReading, secret: book?.secret, isTop: book?.isTop }); }
function progressSignature(progress) { const b = progress?.book ?? progress ?? {}; const reading = (0, progress_fields_1.extractReadingSeconds)(progress); return (0, utils_1.fnv1a)({ progress: b.progress, readingSeconds: reading.value, readingSecondsField: reading.field, finishTime: b.finishTime, chapterUid: b.chapterUid, chapterOffset: b.chapterOffset, updateTime: b.updateTime, isStartReading: b.isStartReading }); }
function noteSignature(row) { return (0, utils_1.fnv1a)({ bookId: row?.bookId, noteCount: row?.noteCount, reviewCount: row?.reviewCount, bookmarkCount: row?.bookmarkCount, sort: row?.sort, readingProgress: row?.readingProgress }); }

},
"constants.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TTL = exports.BOOK_SYNC_PAUSE_MAX_MS = exports.BOOK_SYNC_PAUSE_MIN_MS = exports.BOOK_SYNC_BATCH_SIZE = exports.REQUEST_RETRY_DELAYS_MS = exports.TIME_ZONE = exports.COVER_DIR = exports.PREFERTIME_DIAGNOSTICS_PATH = exports.PROGRESS_DIAGNOSTICS_PATH = exports.DIAGNOSTICS_PATH = exports.OUTPUT_TMP_PATH = exports.OUTPUT_PATH = exports.WEREAD_GATEWAY = exports.WEREAD_SKILL_VERSION = exports.API_KEY_SECRET_ID = exports.PLUGIN_VERSION = exports.PLUGIN_NAME = exports.PLUGIN_ID = void 0;
exports.PLUGIN_ID = "weread-reading-data";
exports.PLUGIN_NAME = "Weread Reading Dashboard";
exports.PLUGIN_VERSION = "1.0.0";
exports.API_KEY_SECRET_ID = "weread-reading-data-api-key";
exports.WEREAD_SKILL_VERSION = "1.0.4";
exports.WEREAD_GATEWAY = "https://i.weread.qq.com/api/agent/gateway";
exports.OUTPUT_PATH = "阅读系统/_数据/reading-data.json";
exports.OUTPUT_TMP_PATH = `${exports.OUTPUT_PATH}.tmp`;
exports.DIAGNOSTICS_PATH = "阅读系统/_数据/同步诊断.md";
exports.PROGRESS_DIAGNOSTICS_PATH = "阅读系统/_数据/同步诊断-getprogress.json";
exports.PREFERTIME_DIAGNOSTICS_PATH = "阅读系统/_数据/同步诊断-prefertime.json";
exports.COVER_DIR = "阅读系统/_数据/assets/covers";
exports.TIME_ZONE = "Asia/Shanghai";
exports.REQUEST_RETRY_DELAYS_MS = [1000, 3000, 8000];
exports.BOOK_SYNC_BATCH_SIZE = 10;
exports.BOOK_SYNC_PAUSE_MIN_MS = 1000;
exports.BOOK_SYNC_PAUSE_MAX_MS = 2000;
exports.TTL = {
    shelf: 60 * 1000,
    notebooks: 60 * 1000,
    currentMonth: 60000,
    currentWeek: 5 * 60000,
    currentYear: 30 * 60000,
    overall: 24 * 60 * 60000,
};

},
"covers/cover-cache.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoverCache = void 0;
const obsidian_1 = require("obsidian");
const constants_1 = __wrd_require("constants.js");
const utils_1 = __wrd_require("utils.js");
async function ensurePublicDir(app, path) {
    const parts = (0, obsidian_1.normalizePath)(path).split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        if (typeof app.vault.getAbstractFileByPath === "function" && app.vault.getAbstractFileByPath(current))
            continue;
        if (typeof app.vault.createFolder === "function") {
            try {
                await app.vault.createFolder(current);
                continue;
            }
            catch { /* adapter fallback */ }
        }
        if (!(await app.vault.adapter.exists(current)))
            await app.vault.adapter.mkdir(current);
    }
}
async function writeBinary(app, path, data) {
    const file = (0, utils_1.asVaultFile)(app, path);
    if (file && typeof app.vault.modifyBinary === "function") {
        await app.vault.modifyBinary(file, data);
        return;
    }
    if (!file && typeof app.vault.createBinary === "function") {
        try {
            await app.vault.createBinary(path, data);
            return;
        }
        catch { /* adapter fallback */ }
    }
    await app.vault.adapter.writeBinary(path, data);
}
class CoverCache {
    constructor(app) {
        this.app = app;
    }
    async cache(bookId, url) {
        if (!url)
            return null;
        await ensurePublicDir(this.app, constants_1.COVER_DIR);
        await (0, utils_1.ensureDir)(this.app.vault.adapter, constants_1.COVER_DIR);
        const path = (0, obsidian_1.normalizePath)(`${constants_1.COVER_DIR}/${(0, utils_1.safeId)(bookId)}.jpg`);
        try {
            const response = await (0, obsidian_1.requestUrl)({ url, method: "GET", throw: false });
            if (response.status < 200 || response.status >= 300 || response.arrayBuffer.byteLength < 100)
                return null;
            // Covers are replaceable cache artifacts. Writing the final path through the
            // Vault API is preferable to an adapter-only temp rename because it updates
            // Obsidian's metadata cache and emits the normal file events.
            await writeBinary(this.app, path, response.arrayBuffer);
            return path;
        }
        catch {
            return null;
        }
    }
}
exports.CoverCache = CoverCache;

},
"data/aggregators.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.finalizeReading = finalizeReading;
const utils_1 = __wrd_require("utils.js");
function finalizeReading(data) {
    const currentMonth = (0, utils_1.monthKey)();
    const month = data.reading.months[currentMonth];
    if (month?.dailySeconds) {
        for (const [date, seconds] of Object.entries(month.dailySeconds)) {
            data.reading.days[date] = { seconds, hasActivity: seconds > 0, quality: month.quality, source: month.source, asOf: month.asOf };
        }
    }
    data.reading.coverage[`month:${currentMonth}`] = month?.coverage ?? "unavailable";
    const currentYear = (0, utils_1.yearKey)();
    data.reading.coverage[`year:${currentYear}`] = data.reading.years[currentYear]?.coverage ?? "unavailable";
}

},
"data/atomic-writer.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishReadingData = publishReadingData;
exports.createInitialReadingData = createInitialReadingData;
exports.ensureInitialReadingData = ensureInitialReadingData;
exports.readPublishedReadingData = readPublishedReadingData;
exports.readPublishedReadingDataValue = readPublishedReadingDataValue;
const constants_1 = __wrd_require("constants.js");
const utils_1 = __wrd_require("utils.js");
const validator_1 = __wrd_require("data/validator.js");
function dataIoError(code, path, message, cause = null) {
    const error = new Error(`${message}：${path}${cause ? `；${cause instanceof Error ? cause.message : String(cause)}` : ""}`);
    error.code = code;
    error.path = path;
    if (cause)
        error.cause = cause;
    return error;
}
async function readAndValidatePath(app, path, { missingOk = false } = {}) {
    const adapter = app.vault.adapter;
    let exists = false;
    try {
        exists = await adapter.exists(path);
    }
    catch (error) {
        throw dataIoError("WRD_DATA_EXISTS_FAILED", path, "无法检查 reading-data 文件", error);
    }
    if (!exists) {
        if (missingOk)
            return null;
        throw dataIoError("WRD_DATA_MISSING", path, "reading-data 文件不存在");
    }
    let raw;
    try {
        raw = await adapter.read(path);
    }
    catch (error) {
        throw dataIoError("WRD_DATA_READ_FAILED", path, "无法读取 reading-data 文件", error);
    }
    let data;
    try {
        data = JSON.parse(raw);
    }
    catch (error) {
        throw dataIoError("WRD_DATA_JSON_INVALID", path, "reading-data JSON 解析失败", error);
    }
    try {
        (0, validator_1.validateReadingData)(data);
    }
    catch (error) {
        throw dataIoError("WRD_DATA_SCHEMA_INVALID", path, "reading-data 结构校验失败", error);
    }
    return { path, raw, data };
}
/**
 * Build the schema-valid bootstrap snapshot created when the plugin is first
 * enabled. This is deliberately real persisted state, not presentation/demo
 * data: zero books simply means the user has not completed the first sync yet.
 */
function createInitialReadingData({ deviceId = null, bookOpenMode = "browser" } = {}) {
    const now = new Date().toISOString();
    const mode = ["browser", "webviewer"].includes(String(bookOpenMode ?? "")) ? String(bookOpenMode) : "browser";
    return {
        schemaVersion: 1,
        timeZone: constants_1.TIME_ZONE,
        scope: { shelfMode: "ebooks", includesAudiobooks: false, includesArticleCollection: false },
        generator: {
            pluginId: constants_1.PLUGIN_ID,
            pluginName: constants_1.PLUGIN_NAME,
            pluginVersion: constants_1.PLUGIN_VERSION,
            wereadSkillVersion: constants_1.WEREAD_SKILL_VERSION,
            deviceId: deviceId || null,
            runId: `bootstrap-${Date.now()}`,
            generatedAt: now,
        },
        sync: {
            status: "idle",
            mode: "none",
            lastAttemptAt: null,
            lastSuccessAt: null,
            warnings: [],
            upgradeInfo: null,
            apiDiagnostics: null,
            retryQueue: { books: 0, entries: [] },
            summary: { books: 0, highlights: 0, thoughts: 0, reviews: 0 },
        },
        entities: { booksById: {}, highlightsById: {}, thoughtsById: {}, reviewsById: {} },
        indexes: { bookIds: [], highlightIdsByBookId: {}, thoughtIdsByBookId: {}, reviewIdsByBookId: {} },
        reading: { coverage: {}, days: {}, weeks: {}, months: {}, years: {}, overall: null },
        views: { home: { todayBookId: null }, preferences: { bookOpenMode: mode } },
    };
}

/**
 * Create the canonical bootstrap file exactly once. Existing valid user data is
 * always preserved; an existing invalid file is surfaced as an error instead of
 * being silently overwritten during plugin startup.
 */
async function ensureInitialReadingData(app, options = {}) {
    const existing = await readPublishedReadingData(app);
    if (existing)
        return { created: false, path: constants_1.OUTPUT_PATH, data: existing.data };
    const adapter = app.vault.adapter;
    const parent = constants_1.OUTPUT_PATH.split("/").slice(0, -1).join("/");
    await (0, utils_1.ensureDir)(adapter, parent);
    const data = createInitialReadingData(options);
    (0, validator_1.validateReadingData)(data);
    const text = JSON.stringify(data, null, 2);
    try {
        // Re-check immediately before creation so a concurrent lifecycle pass can
        // never overwrite a file that appeared after the first existence check.
        if (await adapter.exists(constants_1.OUTPUT_PATH)) {
            const raced = await readAndValidatePath(app, constants_1.OUTPUT_PATH);
            return { created: false, path: constants_1.OUTPUT_PATH, data: raced.data };
        }
        if (typeof app.vault.create === "function") {
            try {
                await app.vault.create(constants_1.OUTPUT_PATH, text);
            }
            catch (error) {
                // If another lifecycle pass won the create race, preserve and
                // strictly validate that file instead of overwriting it.
                if (await adapter.exists(constants_1.OUTPUT_PATH)) {
                    const raced = await readAndValidatePath(app, constants_1.OUTPUT_PATH);
                    return { created: false, path: constants_1.OUTPUT_PATH, data: raced.data };
                }
                throw error;
            }
        }
        else {
            await adapter.write(constants_1.OUTPUT_PATH, text);
        }
        const written = await readAndValidatePath(app, constants_1.OUTPUT_PATH);
        if (written.raw !== text)
            throw dataIoError("WRD_DATA_BOOTSTRAP_MISMATCH", constants_1.OUTPUT_PATH, "初始化 reading-data 后内容不一致");
        return { created: true, path: constants_1.OUTPUT_PATH, data: written.data };
    }
    catch (error) {
        if (error?.code)
            throw error;
        throw dataIoError("WRD_DATA_BOOTSTRAP_FAILED", constants_1.OUTPUT_PATH, "初始化 reading-data 失败", error);
    }
}

/**
 * Canonical reader for the one and only published reading-data file.
 * Missing is the only condition that returns null. Read/JSON/schema failures
 * are explicit errors and must never be disguised as an unsynced dashboard.
 */
async function readPublishedReadingData(app) {
    return await readAndValidatePath(app, constants_1.OUTPUT_PATH, { missingOk: true });
}
async function readPublishedReadingDataValue(app) {
    return (await readPublishedReadingData(app))?.data ?? null;
}
/**
 * Single-file publication path. No backup candidate and no delete/rename gap:
 * validate in memory -> stage -> validate staged bytes -> overwrite canonical
 * file -> re-read canonical bytes with the exact same reader used by the UI.
 */
async function publishReadingData(app, data) {
    (0, validator_1.validateReadingData)(data);
    let previous = null;
    try {
        previous = await readPublishedReadingData(app);
    }
    catch (error) {
        // A broken old file must not prevent a valid full re-sync from repairing
        // the canonical file. The failure stays visible in the console.
        console.warn("[Weread Reading Dashboard] existing reading-data is invalid; replacing it with the new validated publication", error);
    }
    (0, validator_1.validatePublishSafety)(data, previous?.data ?? null);
    const adapter = app.vault.adapter;
    const parent = constants_1.OUTPUT_PATH.split("/").slice(0, -1).join("/");
    await (0, utils_1.ensureDir)(adapter, parent);
    const text = JSON.stringify(data, null, 2);
    try {
        if (await adapter.exists(constants_1.OUTPUT_TMP_PATH))
            await adapter.remove(constants_1.OUTPUT_TMP_PATH);
        await adapter.write(constants_1.OUTPUT_TMP_PATH, text);
        const staged = await readAndValidatePath(app, constants_1.OUTPUT_TMP_PATH);
        (0, validator_1.validatePublishSafety)(staged.data, previous?.data ?? null);
        // Overwrite the canonical file directly. The path is never deliberately
        // removed, so a file watcher cannot observe the old remove/rename gap.
        await adapter.write(constants_1.OUTPUT_PATH, staged.raw);
        const published = await readPublishedReadingData(app);
        if (!published)
            throw dataIoError("WRD_DATA_PUBLISH_MISSING", constants_1.OUTPUT_PATH, "reading-data 发布后文件消失");
        (0, validator_1.validatePublishSafety)(published.data, previous?.data ?? null);
        if (published.raw !== staged.raw)
            throw dataIoError("WRD_DATA_PUBLISH_MISMATCH", constants_1.OUTPUT_PATH, "reading-data 发布后内容与已校验候选不一致");
        return published;
    }
    finally {
        try {
            if (await adapter.exists(constants_1.OUTPUT_TMP_PATH))
                await adapter.remove(constants_1.OUTPUT_TMP_PATH);
        }
        catch (error) {
            console.warn("[Weread Reading Dashboard] cleanup reading-data.tmp failed", error);
        }
    }
}

},
"data/normalizer.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeBook = normalizeBook;
exports.normalizeHighlights = normalizeHighlights;
exports.normalizeReviews = normalizeReviews;
exports.normalizePeriod = normalizePeriod;
const utils_1 = __wrd_require("utils.js");
const progress_fields_1 = __wrd_require("data/progress-fields.js");
const reader_url_1 = __wrd_require("data/reader-url.js");
function normalizeBook(shelf, info, progressPayload, notebook, coverLocalPath, notes, asOf = (0, utils_1.nowIso)()) {
    const id = (0, utils_1.asString)(shelf?.bookId ?? info?.bookId ?? progressPayload?.bookId ?? notebook?.bookId);
    const p = progressPayload?.book ?? progressPayload ?? {};
    const progress = (0, utils_1.asNumber)(p.progress);
    const readingSecondsResult = (0, progress_fields_1.extractReadingSeconds)(progressPayload);
    const readingSeconds = readingSecondsResult.value;
    const finished = progress === 100 || Boolean(p.finishTime) || Boolean(shelf?.finishReading);
    const started = finished || Boolean(p.isStartReading) || ((progress ?? 0) > 0) || Boolean(shelf?.readUpdateTime);
    const highlights = (0, utils_1.asArray)(notes?.highlights);
    const thoughts = (0, utils_1.asArray)(notes?.thoughts);
    const reviews = (0, utils_1.asArray)(notes?.reviews);
    return {
        id, mediaType: "ebook", title: (0, utils_1.asString)(info?.title ?? shelf?.title ?? notebook?.book?.title, "未命名书籍"), author: (0, utils_1.asString)(info?.author ?? shelf?.author ?? notebook?.book?.author), translator: (0, utils_1.asString)(info?.translator) || null,
        category: (0, utils_1.asString)(info?.category ?? shelf?.category ?? notebook?.book?.category, "未分类"), publisher: (0, utils_1.asString)(info?.publisher), intro: (0, utils_1.asString)(info?.intro), isbn: (0, utils_1.asString)(info?.isbn) || null, wordCount: (0, utils_1.asNumber)(info?.wordCount),
        status: finished ? "finished" : started ? "reading" : "unstarted", progress: progress === null ? null : Math.max(0, Math.min(100, Math.round(progress))), lastReadAt: (0, utils_1.unixToIso)(p.updateTime ?? shelf?.readUpdateTime), finishedAt: finished ? (0, utils_1.unixToIso)(p.finishTime) : null,
        readingSeconds, deepLink: (0, utils_1.asString)(info?.deepLink ?? shelf?.deepLink), readerUrl: (0, reader_url_1.buildWereadPcReaderUrl)(id), coverLocalPath, coverRemoteUrl: (0, utils_1.asString)(info?.cover ?? shelf?.cover ?? notebook?.book?.cover) || null,
        counts: { highlights: highlights.length || Math.max(0, Number(notebook?.noteCount ?? 0)), thoughts: thoughts.length || Math.max(0, Number(notebook?.reviewCount ?? 0) - reviews.length), bookReviews: reviews.length, bookmarks: Math.max(0, Number(notebook?.bookmarkCount ?? 0)) },
        quality: { progress: progress === null ? "missing" : "exact", readingSeconds: readingSecondsResult.quality, finishedAt: finished && p.finishTime ? "exact" : "missing" },
        source: { progress: "book.getprogress", readingSeconds: readingSecondsResult.field ? `book.getprogress:${readingSecondsResult.field}` : "book.getprogress:unresolved", metadata: info ? "book.info" : "shelf.sync", notes: notes ? "notes" : "notebooks" }, asOf, deletedRemote: Boolean(shelf?._wrdDeletedRemoteCandidate)
    };
}
function normalizeHighlights(bookId, payload, deepLink) {
    const chapterMap = new Map((0, utils_1.asArray)(payload?.chapters).map((c) => [String(c.chapterUid), (0, utils_1.asString)(c.title)]));
    return (0, utils_1.asArray)(payload?.updated).filter((row) => Number(row?.type ?? 1) === 1 && (0, utils_1.asString)(row?.markText).trim()).map((row, index) => ({
        id: (0, utils_1.asString)(row.bookmarkId) || `${bookId}-highlight-${index}`, bookId, text: (0, utils_1.asString)(row.markText).trim(), chapter: chapterMap.get(String(row.chapterUid)) ?? "", chapterUid: (0, utils_1.asNumber)(row.chapterUid), createdAt: (0, utils_1.unixToIso)(row.createTime), range: (0, utils_1.asString)(row.range), colorStyle: (0, utils_1.asNumber)(row.colorStyle), deepLink
    }));
}
function normalizeReviews(bookId, rows, deepLink) {
    const thoughts = [];
    const reviews = [];
    rows.forEach((wrapper, index) => {
        const r = wrapper?.review ?? wrapper ?? {};
        const text = (0, utils_1.asString)(r.content).trim();
        if (!text)
            return;
        const id = (0, utils_1.asString)(r.reviewId) || `${bookId}-review-${index}`;
        const abstract = (0, utils_1.asString)(r.abstract).trim();
        const chapter = (0, utils_1.asString)(r.chapterName).trim();
        const chapterUid = (0, utils_1.asNumber)(r.chapterUid);
        const reviewType = (0, utils_1.asNumber)(r.type ?? wrapper?.type);
        const isBookReview = reviewType === 6 || (!abstract && !chapter && chapterUid === null && (r.isFinish !== undefined || Number.isFinite(Number(r.star))));
        if (isBookReview) {
            reviews.push({ id, bookId, text, createdAt: (0, utils_1.unixToIso)(r.createTime), star: (0, utils_1.asNumber)(r.star), isFinish: r.isFinish === undefined ? null : Boolean(r.isFinish), deepLink });
        }
        else
            thoughts.push({ id, bookId, text, abstract, chapter, chapterUid, createdAt: (0, utils_1.unixToIso)(r.createTime), kind: reviewType === 4 || chapter || chapterUid !== null ? "chapter-comment" : abstract ? "highlight-thought" : "thought", deepLink });
    });
    return { thoughts, reviews };
}
function parseReadStatCount(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return Math.max(0, value);
    const match = String(value ?? "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
    if (!match)
        return null;
    const number = Number(match[0]);
    return Number.isFinite(number) ? Math.max(0, number) : null;
}
function normalizeReadStat(payload) {
    const out = { readBooks: null, finishedBooks: null, readingDays: null, notes: null };
    const raw = payload?.readStat;
    const assign = (statValue, countValue) => {
        const stat = (0, utils_1.asString)(statValue).trim();
        const count = parseReadStatCount(countValue);
        if (count === null || !stat)
            return;
        if (stat === "finishedBooks" || stat.includes("读完"))
            out.finishedBooks = count;
        else if (stat === "notes" || stat.includes("笔记"))
            out.notes = count;
        else if (stat === "readBooks" || stat === "读过" || stat.includes("读过"))
            out.readBooks = count;
        else if (stat === "readingDays" || stat === "阅读" || stat.includes("阅读"))
            out.readingDays = count;
    };
    if (Array.isArray(raw)) {
        for (const row of raw)
            assign(row?.stat, row?.counts ?? row?.count ?? row?.value);
    }
    else if (raw && typeof raw === "object") {
        for (const [key, value] of Object.entries(raw)) {
            if (value && typeof value === "object")
                assign(value.stat ?? key, value.counts ?? value.count ?? value.value);
            else
                assign(key, value);
        }
    }
    return out;
}
function normalizePeriod(mode, payload, asOf = (0, utils_1.nowIso)()) {
    const responseBase = Number(payload?.baseTime);
    const requestedBase = Number(payload?.__wrdRequestedBaseTime);
    const effectiveBase = Number.isFinite(responseBase) && responseBase > 0 ? responseBase : Number.isFinite(requestedBase) && requestedBase > 0 ? requestedBase : Date.now();
    const key = (0, utils_1.periodKeyFromBase)(mode, effectiveBase);
    const readTimes = payload?.readTimes && typeof payload.readTimes === "object" ? payload.readTimes : {};
    const daily = payload?.dailyReadTimes && typeof payload.dailyReadTimes === "object" ? payload.dailyReadTimes : {};
    const daySource = (mode === "annually" && Object.keys(daily).length) ? daily : (mode === "monthly" || mode === "weekly") ? readTimes : {};
    const dailySeconds = {};
    const days = {};
    for (const [raw, value] of Object.entries(daySource)) {
        const date = (0, utils_1.shanghaiDateKey)(raw);
        const seconds = Math.max(0, Number(value) || 0);
        if (!date)
            continue;
        dailySeconds[date] = seconds;
        days[date] = { seconds, hasActivity: seconds > 0, quality: "exact", source: `readdata.${mode}`, asOf };
    }
    let monthlySeconds;
    if (mode === "annually") {
        monthlySeconds = Array(12).fill(null);
        for (const [raw, value] of Object.entries(readTimes)) {
            const date = (0, utils_1.shanghaiDateKey)(raw);
            if (!date)
                continue;
            const month = Number(date.slice(5, 7));
            if (month >= 1 && month <= 12)
                monthlySeconds[month - 1] = Math.max(0, Number(value) || 0);
        }
    }
    const preferRaw = Array.isArray(payload?.preferTime) && payload.preferTime.length === 24
        ? payload.preferTime.map((v) => Math.max(0, Number(v) || 0))
        : null;
    // WeRead returns preferTime in 06:00 -> next-day 05:00 order.
    // Canonical reading data uses normal clock order 00:00 -> 23:00 so every UI consumer can slice hours directly.
    const prefer = preferRaw ? [...preferRaw.slice(18), ...preferRaw.slice(0, 18)] : null;
    const fact = { periodType: mode === "weekly" ? "week" : mode === "monthly" ? "month" : "year", startDate: mode === "overall" ? null : (0, utils_1.shanghaiDateKey)(effectiveBase), endDate: null, totalSeconds: (0, utils_1.asNumber)(payload?.totalReadTime), readDays: (0, utils_1.asNumber)(payload?.readDays), readStat: normalizeReadStat(payload), coverage: "complete", quality: "exact", source: `readdata.${mode}`, asOf };
    if (mode === "weekly" || mode === "monthly")
        fact.dailySeconds = dailySeconds;
    if (mode === "monthly")
        fact.preferTimeSeconds = prefer;
    if (mode === "annually") {
        fact.dailySeconds = dailySeconds;
        fact.monthlySeconds = monthlySeconds;
        fact.preferTimeSeconds = prefer;
    }
    if (mode === "overall")
        fact.preferTimeSeconds = prefer;
    return { key, fact, days };
}

},
"data/progress-fields.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractReadingSeconds = extractReadingSeconds;
exports.collectProgressFieldSnapshot = collectProgressFieldSnapshot;
const ACTIVE_READING_TIME_PATHS = ["book.readingTime", "readingTime", "book.recordReadingTime", "recordReadingTime"];
function extractReadingSeconds(payload) {
    const candidates = [];
    for (const path of ACTIVE_READING_TIME_PATHS) {
        const raw = getPath(payload, path);
        if (raw === null || raw === undefined || raw === "")
            continue;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0)
            continue;
        candidates.push({ path, value });
    }
    const preferred = candidates[0] ?? null;
    return {
        value: preferred?.value ?? null,
        field: preferred?.path ?? null,
        quality: preferred ? "exact" : "missing",
        candidates,
    };
}
function collectProgressFieldSnapshot(payload) {
    const output = {};
    visit(payload, "", output, 0);
    return output;
}
function visit(value, path, output, depth) {
    if (depth > 5 || value === null || value === undefined)
        return;
    if (Array.isArray(value)) {
        if (path && relevant(path))
            output[path] = `[array:${value.length}]`;
        value.slice(0, 8).forEach((item, index) => visit(item, `${path}[${index}]`, output, depth + 1));
        return;
    }
    if (typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
            const next = path ? `${path}.${key}` : key;
            if (/authorization|token|secret|api.?key|cookie/i.test(key)) {
                output[next] = "***";
                continue;
            }
            visit(item, next, output, depth + 1);
        }
        return;
    }
    if (!path || !relevant(path))
        return;
    if (typeof value === "string")
        output[path] = value.length > 160 ? `${value.slice(0, 157)}...` : value;
    else if (typeof value === "number" || typeof value === "boolean")
        output[path] = value;
}
function relevant(path) {
    return /progress|read|time|finish|update|chapter|bookid|offset|duration|second/i.test(path);
}
function getPath(value, path) {
    let current = value;
    for (const part of path.split(".")) {
        if (!current || typeof current !== "object")
            return undefined;
        current = current[part];
    }
    return current;
}

},
"data/reader-url.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWereadPcReaderUrl = buildWereadPcReaderUrl;
function md5(input) {
    try {
        const crypto = require("crypto");
        return crypto.createHash("md5").update(input, "utf8").digest("hex");
    }
    catch {
        return "";
    }
}
function encodeBookIdParts(bookId) {
    if (/^\d+$/.test(bookId)) {
        const parts = [];
        for (let i = 0; i < bookId.length; i += 9) {
            const chunk = bookId.slice(i, Math.min(i + 9, bookId.length));
            parts.push(parseInt(chunk, 10).toString(16));
        }
        return ["3", parts];
    }
    let hex = "";
    for (let i = 0; i < bookId.length; i++)
        hex += bookId.charCodeAt(i).toString(16);
    return ["4", [hex]];
}
/**
 * Build the same PC reader URL used by the mature Obsidian Weread plugin.
 * Weread's /web/reader/ path does NOT accept a raw bookId; it expects this
 * derived reader id. Keep this derived value separate from the API bookId.
 */
function buildWereadPcReaderUrl(bookId) {
    const id = String(bookId ?? "").trim();
    if (!id)
        return "";
    const digest = md5(id);
    if (!digest)
        return "";
    const [kind, parts] = encodeBookIdParts(id);
    let readerId = digest.slice(0, 3) + kind + "2" + digest.slice(-2);
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const lenHex = part.length.toString(16).padStart(2, "0");
        readerId += lenHex + part;
        if (i < parts.length - 1)
            readerId += "g";
    }
    if (readerId.length < 20)
        readerId += digest.slice(0, 20 - readerId.length);
    readerId += md5(readerId).slice(0, 3);
    return `https://weread.qq.com/web/reader/${readerId}`;
}

},
"data/validator.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readingDataSummary = readingDataSummary;
exports.isSuspiciousRegression = isSuspiciousRegression;
exports.isUnsafePartialRegression = isUnsafePartialRegression;
exports.validatePublishSafety = validatePublishSafety;
exports.validateReadingData = validateReadingData;
function readingDataSummary(data) {
    return {
        books: Object.keys(data?.entities?.booksById ?? {}).length,
        highlights: Object.keys(data?.entities?.highlightsById ?? {}).length,
        thoughts: Object.keys(data?.entities?.thoughtsById ?? {}).length,
        reviews: Object.keys(data?.entities?.reviewsById ?? {}).length,
        totalSeconds: Math.max(0, Number(data?.reading?.overall?.totalSeconds ?? 0) || 0),
        readDays: Math.max(0, Number(data?.reading?.overall?.readDays ?? 0) || 0),
    };
}
function droppedTooFar(previous, candidate, minimumPrevious, ratio) {
    if (previous < minimumPrevious)
        return false;
    return candidate < Math.floor(previous * ratio);
}
function officialReadStat(data) {
    const value = data?.reading?.overall?.readStat;
    return value && typeof value === "object" ? value : null;
}
function officialMetricDropped(previous, candidate, key, minimumPrevious, ratio = 0.98) {
    const prevValue = Math.max(0, Number(previous?.[key] ?? 0) || 0);
    const nextValue = Math.max(0, Number(candidate?.[key] ?? 0) || 0);
    return droppedTooFar(prevValue, nextValue, minimumPrevious, ratio);
}
function isSuspiciousRegression(candidate, previous) {
    if (!candidate || !previous)
        return false;
    const next = readingDataSummary(candidate);
    const prev = readingDataSummary(previous);
    if (prev.books > 0 && next.books === 0)
        return true;
    if (droppedTooFar(prev.books, next.books, 20, 0.5))
        return true;
    if (prev.highlights > 0 && next.highlights === 0 && prev.highlights >= 20)
        return true;
    if (droppedTooFar(prev.highlights, next.highlights, 100, 0.35))
        return true;
    if (prev.thoughts > 0 && next.thoughts === 0 && prev.thoughts >= 10)
        return true;
    if (droppedTooFar(prev.thoughts, next.thoughts, 50, 0.35))
        return true;
    if (prev.totalSeconds >= 3600 && next.totalSeconds === 0)
        return true;
    if (prev.readDays >= 10 && next.readDays === 0)
        return true;
    return false;
}
/**
 * A partial sync is allowed to publish when it preserves the previous public
 * dataset. If a partial run also carries a material regression, the public
 * reading-data generation must stay on the currently published snapshot.
 * Complete syncs remain subject to the broader previous-publication regression guard; this
 * intentionally favors preserving known-good user data over accepting a sudden shrink.
 */
function isUnsafePartialRegression(candidate, previous) {
    if (!candidate || !previous || candidate?.sync?.status !== "partial")
        return false;
    const next = readingDataSummary(candidate);
    const prev = readingDataSummary(previous);
    if (droppedTooFar(prev.books, next.books, 20, 0.90))
        return true;
    if (droppedTooFar(prev.highlights, next.highlights, 100, 0.90))
        return true;
    if (droppedTooFar(prev.thoughts, next.thoughts, 20, 0.80))
        return true;
    if (droppedTooFar(prev.reviews, next.reviews, 20, 0.80))
        return true;
    // Overall time and reading days are cumulative account metrics; a material
    // decrease during a partial run is evidence of incomplete statistics.
    if (droppedTooFar(prev.totalSeconds, next.totalSeconds, 3600, 0.98))
        return true;
    if (droppedTooFar(prev.readDays, next.readDays, 30, 0.98))
        return true;
    const prevOfficial = officialReadStat(previous);
    const nextOfficial = officialReadStat(candidate);
    if (prevOfficial && nextOfficial) {
        if (officialMetricDropped(prevOfficial, nextOfficial, "readBooks", 20))
            return true;
        if (officialMetricDropped(prevOfficial, nextOfficial, "finishedBooks", 10))
            return true;
        if (officialMetricDropped(prevOfficial, nextOfficial, "readingDays", 30))
            return true;
        if (officialMetricDropped(prevOfficial, nextOfficial, "notes", 50, 0.90))
            return true;
    }
    return false;
}
function publishRegressionMessage(candidate, previous, prefix) {
    const before = readingDataSummary(previous);
    const after = readingDataSummary(candidate);
    return `${prefix}：books ${before.books}→${after.books}, highlights ${before.highlights}→${after.highlights}, thoughts ${before.thoughts}→${after.thoughts}, reviews ${before.reviews}→${after.reviews}, readDays ${before.readDays}→${after.readDays}, totalSeconds ${before.totalSeconds}→${after.totalSeconds}`;
}
function validatePublishSafety(candidate, previous) {
    validateReadingData(candidate);
    if (!previous)
        return;
    validateReadingData(previous);
    if (isSuspiciousRegression(candidate, previous))
        throw new Error(publishRegressionMessage(candidate, previous, "拒绝发布疑似不完整 reading-data"));
    if (isUnsafePartialRegression(candidate, previous))
        throw new Error(publishRegressionMessage(candidate, previous, "拒绝发布 partial sync 的显著回退数据"));
}
function validateRecordIndex(data, indexKey, entityKey, label) {
    const indexMap = data?.indexes?.[indexKey];
    const entityMap = data?.entities?.[entityKey];
    if (!indexMap || typeof indexMap !== "object" || Array.isArray(indexMap))
        throw new Error(`indexes.${indexKey} 必须为对象`);
    if (!entityMap || typeof entityMap !== "object" || Array.isArray(entityMap))
        throw new Error(`entities.${entityKey} 必须为对象`);
    const books = data.entities.booksById ?? {};
    const seen = new Set();
    for (const [bookId, ids] of Object.entries(indexMap)) {
        if (!books[bookId])
            throw new Error(`${indexKey} 引用了不存在的书籍 ${bookId}`);
        if (!Array.isArray(ids))
            throw new Error(`${indexKey}.${bookId} 必须为数组`);
        const local = new Set();
        for (const rawId of ids) {
            const id = String(rawId ?? "").trim();
            if (!id)
                throw new Error(`${indexKey}.${bookId} 存在空 ${label} ID`);
            if (local.has(id))
                throw new Error(`${indexKey}.${bookId} 存在重复 ${label} ID ${id}`);
            local.add(id);
            const entity = entityMap[id];
            if (!entity)
                throw new Error(`${indexKey}.${bookId} 引用了不存在的 ${label} ${id}`);
            if (String(entity.bookId ?? "") !== String(bookId))
                throw new Error(`${label} ${id} 的 bookId 与索引所属书籍不一致`);
            if (seen.has(id))
                throw new Error(`${label} ${id} 被多个书籍索引重复引用`);
            seen.add(id);
        }
    }
    for (const [id, entity] of Object.entries(entityMap)) {
        const bookId = String(entity?.bookId ?? "").trim();
        if (!bookId || !books[bookId])
            throw new Error(`${label} ${id} 缺少有效 bookId`);
        if (entity?.id !== undefined && String(entity.id) !== id)
            throw new Error(`${label} entity key ${id} 与 entity.id ${entity.id} 不一致`);
        if (!seen.has(id))
            throw new Error(`${label} ${id} 未出现在 ${indexKey}.${bookId} 中`);
    }
}
function validateReadingData(data) {
    if (!data || data.schemaVersion !== 1)
        throw new Error("reading-data schemaVersion 必须为 1");
    if (data.timeZone !== "Asia/Shanghai")
        throw new Error("reading-data timeZone 必须为 Asia/Shanghai");
    for (const key of ["entities", "indexes", "reading", "views", "sync", "generator"])
        if (!data[key])
            throw new Error(`reading-data 缺少 ${key}`);
    if (!Array.isArray(data.indexes.bookIds))
        throw new Error("indexes.bookIds 必须为数组");
    const uniqueBookIds = new Set(data.indexes.bookIds);
    if (uniqueBookIds.size !== data.indexes.bookIds.length)
        throw new Error("indexes.bookIds 存在重复书籍 ID");
    for (const id of data.indexes.bookIds)
        if (!data.entities.booksById[id])
            throw new Error(`索引引用不存在的书籍 ${id}`);
    const entityBookIds = Object.keys(data.entities.booksById ?? {});
    if (entityBookIds.length !== data.indexes.bookIds.length)
        throw new Error("booksById 与 indexes.bookIds 数量不一致");
    validateRecordIndex(data, "highlightIdsByBookId", "highlightsById", "划线");
    validateRecordIndex(data, "thoughtIdsByBookId", "thoughtsById", "想法");
    validateRecordIndex(data, "reviewIdsByBookId", "reviewsById", "书评");
    for (const period of [...Object.values(data.reading.months ?? {}), ...Object.values(data.reading.years ?? {}), data.reading.overall].filter(Boolean)) {
        const p = period?.preferTimeSeconds;
        if (p !== null && p !== undefined && (!Array.isArray(p) || p.length !== 24))
            throw new Error("preferTimeSeconds 必须为 24 项或 null");
    }
}

},
"data/view-model-builder.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildViews = buildViews;
function buildViews(data) {
    const books = data.indexes.bookIds.map(id => data.entities.booksById[id]).filter(Boolean);
    const ordered = [...books].sort((a, b) => (Date.parse(b.lastReadAt ?? "") || 0) - (Date.parse(a.lastReadAt ?? "") || 0) || a.title.localeCompare(b.title, "zh-CN"));
    const today = ordered.find(b => b.status === "reading") ?? ordered[0] ?? null;
    const source = [...books].sort((a, b) => (b.counts.highlights + b.counts.thoughts + b.counts.bookReviews) - (a.counts.highlights + a.counts.thoughts + a.counts.bookReviews)).slice(0, 4);
    const categories = new Map();
    books.forEach(b => categories.set(b.category || "未分类", (categories.get(b.category || "未分类") ?? 0) + 1));
    const inspiration = [...Object.values(data.entities.highlightsById), ...Object.values(data.entities.thoughtsById)].sort((a, b) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0)).map((r) => ({ kind: "abstract" in r ? "thought" : "highlight", id: r.id, bookId: r.bookId }));
    return { home: { todayBookId: today?.id ?? null, inspirationRecords: inspiration, recentShelfBookIds: ordered.slice(0, 6).map(b => b.id), topSourceBookIds: source.map(b => b.id), topCategories: [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name, count })) }, bookshelf: { orderedBookIds: ordered.map(b => b.id) }, knowledge: { recentRecordIds: inspiration.slice(0, 200) }, reviewPeriods: {} };
}

},
"diagnostics/progress-samples.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordProgressFieldSample = recordProgressFieldSample;
exports.loadProgressFieldDiagnostics = loadProgressFieldDiagnostics;
const utils_1 = __wrd_require("utils.js");
const progress_fields_1 = __wrd_require("data/progress-fields.js");
const FILE = "diagnostics/progress-field-samples.json";
async function recordProgressFieldSample(cache, bookId, payload) {
    const existing = await loadProgressFieldDiagnostics(cache);
    const p = payload?.book ?? payload ?? {};
    const progress = (0, utils_1.asNumber)(p.progress);
    const sampleKind = progress === 100 || Boolean(p.finishTime)
        ? "finished"
        : (progress ?? 0) > 0 || Boolean(p.isStartReading)
            ? "reading"
            : "other";
    const extraction = (0, progress_fields_1.extractReadingSeconds)(payload);
    const sample = {
        capturedAt: (0, utils_1.nowIso)(),
        bookId,
        sampleKind,
        progress,
        candidateField: extraction.field,
        candidateValue: extraction.value,
        candidates: extraction.candidates,
        fields: (0, progress_fields_1.collectProgressFieldSnapshot)(payload),
    };
    const samples = existing.samples.filter((row) => row.bookId !== bookId);
    const sameKind = samples.findIndex((row) => row.sampleKind === sampleKind);
    if (sameKind >= 0)
        samples[sameKind] = sample;
    else
        samples.push(sample);
    const prioritized = [
        ...samples.filter((row) => row.sampleKind === "reading"),
        ...samples.filter((row) => row.sampleKind === "finished"),
        ...samples.filter((row) => row.sampleKind === "other"),
    ].slice(0, 3);
    await cache.writeJson(FILE, {
        status: "verified",
        note: "真实 Agent Gateway 样本已确认当前环境优先使用 book.readingTime（秒）作为单本累计阅读时长；若该字段缺失，插件按兼容顺序回退到 readingTime、book.recordReadingTime、recordReadingTime。",
        updatedAt: (0, utils_1.nowIso)(),
        samples: prioritized,
    });
}
async function loadProgressFieldDiagnostics(cache) {
    const diagnostics = await cache.readJson(FILE, {
        status: "awaiting-samples",
        note: "尚未取得 alpha.5 的真实 /book/getprogress 脱敏样本。",
        updatedAt: null,
        samples: [],
    });
    const hasObservedReadingTime = diagnostics.samples.some((sample) => sample.candidates.some((row) => (row.path === "book.readingTime" || row.path === "readingTime") && row.value >= 0));
    if (hasObservedReadingTime) {
        return {
            ...diagnostics,
            status: "verified",
            note: "真实 Agent Gateway 样本已确认当前环境优先使用 book.readingTime（秒）作为单本累计阅读时长；若该字段缺失，插件按兼容顺序回退到 readingTime、book.recordReadingTime、recordReadingTime。",
        };
    }
    return diagnostics;
}

},
"diagnostics/sync-diagnostics.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSyncDiagnosticsMarkdown = createSyncDiagnosticsMarkdown;
exports.writeSyncDiagnostics = writeSyncDiagnostics;
exports.openSyncDiagnostics = openSyncDiagnostics;
const constants_1 = __wrd_require("constants.js");
const utils_1 = __wrd_require("utils.js");
function escapeCell(value) {
    return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
async function writeText(app, path, text) {
    const file = (0, utils_1.asVaultFile)(app, path);
    if (file) {
        await app.vault.modify(file, text);
        return;
    }
    await app.vault.create(path, text);
}
function createSyncDiagnosticsMarkdown(data) {
    const warnings = Array.isArray(data?.sync?.warnings) ? data.sync.warnings : [];
    const grouped = new Map();
    for (const warning of warnings) {
        const code = String(warning?.code || "unknown");
        const current = grouped.get(code) ?? { count: 0, sample: String(warning?.message || "") };
        current.count += 1;
        if (!current.sample && warning?.message)
            current.sample = String(warning.message);
        grouped.set(code, current);
    }
    const books = Object.keys(data?.entities?.booksById ?? {}).length;
    const highlights = Object.keys(data?.entities?.highlightsById ?? {}).length;
    const thoughts = Object.keys(data?.entities?.thoughtsById ?? {}).length;
    const reviews = Object.keys(data?.entities?.reviewsById ?? {}).length;
    const apiDiagnostics = data?.sync?.apiDiagnostics ?? null;
    const retryQueue = data?.sync?.retryQueue ?? { books: 0, entries: [] };
    const fieldDiagnostics = data?.sync?.progressFieldDiagnostics ?? null;
    const lines = [
        "---",
        "type: weread-sync-diagnostics",
        `updated: ${JSON.stringify(data?.generator?.generatedAt ?? new Date().toISOString())}`,
        "---",
        "",
        "# 微信读书同步诊断",
        "",
        "> 该文件由 Weread Reading Dashboard 自动生成，不包含 API Key；可能包含书名、bookId 与错误上下文等阅读元数据。可将本文件发送给开发者排查。另生成脱敏字段样本 `同步诊断-getprogress.json` 与阅读时段字段样本 `同步诊断-prefertime.json`。",
        "",
        "## 运行与同步摘要",
        "",
        "| 项目 | 数值 |",
        "|---|---:|",
        `| 插件版本 | ${escapeCell(data?.generator?.pluginVersion ?? "-")} |`,
        `| 数据结构版本 | ${escapeCell(data?.schemaVersion ?? "-")} |`,
        `| Skills 版本 | ${escapeCell(data?.generator?.wereadSkillVersion ?? "-")} |`,
        `| 诊断生成时间 | ${escapeCell(data?.generator?.generatedAt ?? "-")} |`,
        `| 状态 | ${escapeCell(data?.sync?.status ?? "-")} |`,
        `| 模式 | ${escapeCell(data?.sync?.mode ?? "-")} |`,
        `| 最近尝试 | ${escapeCell(data?.sync?.lastAttemptAt ?? "-")} |`,
        `| 最近成功 | ${escapeCell(data?.sync?.lastSuccessAt ?? "-")} |`,
        `| 书籍 | ${books} |`,
        `| 划线 | ${highlights} |`,
        `| 想法 | ${thoughts} |`,
        `| 整本书评 | ${reviews} |`,
        `| 警告 | ${warnings.length} |`,
        `| 待补齐书籍 | ${Number(retryQueue?.books ?? 0)} |`,
        "",
    ];
    appendPublicationHealth(lines, data?.sync?.publicationHealth ?? null);
    appendUiConsumptionHealth(lines, data?.sync?.uiConsumptionHealth ?? null);
    appendApiDiagnostics(lines, apiDiagnostics);
    appendRetryQueue(lines, retryQueue);
    appendProgressFields(lines, fieldDiagnostics);
    appendPreferTimeDiagnostics(lines, data?.sync?.preferTimeDiagnostics ?? null);
    if (!warnings.length) {
        lines.push("## 警告", "", "没有同步警告。", "");
    }
    else {
        lines.push("## 警告分类", "", "| 代码 | 数量 | 示例 |", "|---|---:|---|");
        for (const [code, value] of [...grouped.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))) {
            lines.push(`| \`${escapeCell(code)}\` | ${value.count} | ${escapeCell(value.sample)} |`);
        }
        lines.push("", "## 警告明细", "");
        warnings.forEach((warning, index) => {
            lines.push(`### ${index + 1}. ${escapeCell(warning.code || "unknown")}`, "", escapeCell(warning.message || "无说明"));
            if (warning.context && Object.keys(warning.context).length) {
                lines.push("", "```json", JSON.stringify(sanitizeForExport(warning.context), null, 2), "```");
            }
            lines.push("");
        });
    }
    if (books === 0) {
        lines.push("## 无书籍数据排查", "", "- 确认插件设置中的 API Key 已验证并保存。", "- 在首页右上角点击刷新，或在插件设置中执行“重新完整同步”。", "- 确认看板安装在 Vault 根目录的 `阅读系统/`，不要直接打开完整交付包中的嵌套模板。", "- 查看上方接口诊断、失败书补齐队列与警告分类。", "");
    }
    return lines.join("\n");
}
function appendPublicationHealth(lines, health) {
    lines.push("## reading-data 发布状态", "");
    if (!health) {
        lines.push("未记录发布文件健康信息。可在插件设置中重新点击“诊断”刷新。", "");
        return;
    }
    lines.push("| 项目 | 数值 |", "|---|---:|",
        `| 路径 | ${escapeCell(health.path ?? constants_1.OUTPUT_PATH)} |`,
        `| 文件存在 | ${health.exists ? "是" : "否"} |`,
        `| 可读取 | ${health.readable ? "是" : "否"} |`,
        `| 字节数 | ${health.bytes ?? "—"} |`,
        `| Schema | ${health.schemaVersion ?? "—"} |`,
        `| generatedAt | ${escapeCell(health.generatedAt ?? "—")} |`,
        `| 书籍 | ${health.books ?? "—"} |`,
        `| 划线 | ${health.highlights ?? "—"} |`,
        `| 想法 | ${health.thoughts ?? "—"} |`,
        `| 错误 | ${escapeCell(health.error ?? "—")} |`,
        "");
}
function appendUiConsumptionHealth(lines, health) {
    lines.push("## 看板数据消费状态", "");
    if (!health) {
        lines.push("当前未记录 UI DataStore 状态。可在插件设置中重新点击“诊断”刷新。", "");
        return;
    }
    lines.push("| 项目 | 数值 |", "|---|---:|",
        `| 数据路径 | ${escapeCell(health.dataPath ?? constants_1.OUTPUT_PATH)} |`,
        `| Snapshot 状态 | ${escapeCell(health.snapshotState ?? "—")} |`,
        `| Revision | ${health.revision ?? "—"} |`,
        `| 最近载入原因 | ${escapeCell(health.reason ?? "—")} |`,
        `| 最近载入时间 | ${escapeCell(health.lastLoadedAt ?? "—")} |`,
        `| UI 书籍 | ${health.books ?? "—"} |`,
        `| UI 划线 | ${health.highlights ?? "—"} |`,
        `| UI 想法 | ${health.thoughts ?? "—"} |`,
        `| UI 读取错误 | ${escapeCell(health.lastError ?? "—")} |`,
        `| 展示补全错误 | ${escapeCell(health.presentationError ?? "—")} |`,
        "");
}
function appendApiDiagnostics(lines, diagnostics) {
    lines.push("## 按接口请求诊断", "");
    if (!diagnostics?.byApi || !Object.keys(diagnostics.byApi).length) {
        lines.push("本次没有远端接口请求（可能尚未同步，或刷新处于冷却期）。", "");
        return;
    }
    lines.push(`重试策略：最多 ${Number(diagnostics.maxRetries ?? 0)} 次重试；退避 ${JSON.stringify(diagnostics.retryDelaysMs ?? [])} ms，并附加 0–400 ms 抖动。`, "", "| API | 逻辑调用 | 总尝试 | 重试 | 成功 | 最终失败 | HTTP 499 | 其他状态 |", "|---|---:|---:|---:|---:|---:|---:|---|");
    for (const [apiName, row] of Object.entries(diagnostics.byApi)) {
        const statuses = row?.statuses ?? {};
        const other = Object.entries(statuses).filter(([key]) => key !== "499").map(([key, count]) => `${key}:${count}`).join(", ") || "—";
        lines.push(`| \`${escapeCell(apiName)}\` | ${Number(row.calls ?? 0)} | ${Number(row.attempts ?? 0)} | ${Number(row.retries ?? 0)} | ${Number(row.successes ?? 0)} | ${Number(row.failures ?? 0)} | ${Number(statuses["499"] ?? 0)} | ${escapeCell(other)} |`);
    }
    const events = Array.isArray(diagnostics.events) ? diagnostics.events : [];
    lines.push("", "### 重试与最终失败明细", "");
    if (!events.length)
        lines.push("没有发生重试或最终失败。", "");
    else {
        lines.push("| 时间 | API | bookId | 尝试 | 结果 | 状态 | 下一次退避 | 说明 |", "|---|---|---|---:|---|---|---:|---|");
        for (const event of events) {
            const status = event.status ?? (event.errcode !== null && event.errcode !== undefined ? `errcode ${event.errcode}` : "network");
            lines.push(`| ${escapeCell(event.at)} | \`${escapeCell(event.apiName)}\` | ${escapeCell(event.bookId ?? "—")} | ${Number(event.attempt ?? 0)}/${Number(event.maxAttempts ?? 0)} | ${escapeCell(event.outcome)} | ${escapeCell(status)} | ${event.nextDelayMs ?? "—"} | ${escapeCell(event.message)} |`);
        }
        lines.push("");
    }
}
function appendRetryQueue(lines, retryQueue) {
    lines.push("## 失败书补齐队列", "");
    const entries = Array.isArray(retryQueue?.entries) ? retryQueue.entries : [];
    if (!entries.length) {
        lines.push("队列为空。", "");
        return;
    }
    lines.push("快速同步会优先处理以下书籍，并只强制补齐失败接口；接口成功后会从队列逐项移除。", "", "| bookId | 书名 | 待补齐接口 | 最近失败 |", "|---|---|---|---|");
    for (const entry of entries) {
        const pending = Object.keys(entry?.pending ?? {}).join(", ") || "—";
        lines.push(`| ${escapeCell(entry.bookId)} | ${escapeCell(entry.title)} | ${escapeCell(pending)} | ${escapeCell(entry.lastFailedAt)} |`);
    }
    lines.push("");
}
function appendPreferTimeDiagnostics(lines, diagnostics) {
    lines.push("## 阅读时段 preferTime 诊断", "");
    if (!diagnostics) {
        lines.push("本次尚未记录阅读时段字段诊断。可在设置 → 高级设置 → 故障排查中执行“刷新诊断”。", "");
        return;
    }
    const statusText = {
        available: "总计 preferTime 可用于渲染",
        "overall-cache-missing": "总计统计缓存不存在",
        "overall-response-missing": "总计统计响应不存在",
        "overall-request-failed": "总计统计请求失败",
        "preferTime-missing": "总计统计缺少 preferTime 字段",
        "preferTime-not-array": "preferTime 不是数组",
        "preferTime-bucket-count-invalid": "preferTime 不是 24 个小时桶",
        "normalize-failed": "preferTime 标准化失败",
        "preferTime-all-zero": "24 个小时桶全部为 0",
    }[diagnostics.status] ?? String(diagnostics.status ?? "unknown");
    const overall = diagnostics?.modes?.overall ?? null;
    lines.push("| 项目 | 数值 |", "|---|---:|",
        `| 诊断来源 | ${escapeCell(diagnostics?.source ?? "cache")} |`,
        `| 总计统计响应 | ${overall?.cachePresent ? "成功" : "不存在"} |`,
        `| 总计统计请求错误 | ${escapeCell(overall?.requestError ?? "—")} |`,
        `| 总计累计阅读时长 | ${overall?.totalReadTime ?? "—"} 秒 |`,
        `| 总计阅读天数 | ${overall?.readDays ?? "—"} |`,
        `| 原始 preferTime 字段 | ${overall?.preferTime?.present ? "存在" : "不存在"} |`,
        `| 原始类型 | ${escapeCell(overall?.preferTime?.type ?? "—")} |`,
        `| 原始桶数 | ${overall?.preferTime?.buckets ?? "—"} |`,
        `| 非零桶数 | ${overall?.preferTime?.nonZeroBuckets ?? "—"} |`,
        `| 桶内总秒数 | ${overall?.preferTime?.sumSeconds ?? "—"} |`,
        `| preferTimeWord | ${overall?.preferTimeWord?.present ? escapeCell(overall.preferTimeWord.value ?? "存在") : "不存在"} |`,
        `| 判断 | ${escapeCell(statusText)} |`,
        "");
    const modes = diagnostics?.modes ?? {};
    lines.push("### 各统计模式字段对比", "", "| mode | totalReadTime | readDays | readTimes 桶数 | preferTime | preferTimeWord |", "|---|---:|---:|---:|---|---|");
    for (const mode of ["weekly", "monthly", "annually", "overall"]) {
        const row = modes[mode] ?? {};
        const pt = row.preferTime ?? {};
        const ptText = !row.cachePresent ? (row.requestError ? `请求失败：${row.requestError}` : "无响应") : pt.present ? `${pt.buckets ?? "?"} 桶 / ${pt.sumSeconds ?? "?"} 秒` : "不存在";
        const wordText = row.preferTimeWord?.present ? String(row.preferTimeWord.value ?? "存在") : "不存在";
        lines.push(`| ${mode} | ${row.totalReadTime ?? "—"} | ${row.readDays ?? "—"} | ${row.readTimesBuckets ?? "—"} | ${escapeCell(ptText)} | ${escapeCell(wordText)} |`);
    }
    lines.push("", "### 总计原始字段列表", "", overall?.responseFields?.length ? `\`${overall.responseFields.join("\`, \`")}\`` : "—", "", "详细脱敏结构见 `阅读系统/_数据/同步诊断-prefertime.json`。", "");
}
function appendProgressFields(lines, fieldDiagnostics) {
    lines.push("## /book/getprogress 阅读时长字段核验", "");
    if (!fieldDiagnostics) {
        lines.push("尚无字段诊断。", "");
        return;
    }
    lines.push(`状态：\`${escapeCell(fieldDiagnostics.status)}\``, "", escapeCell(fieldDiagnostics.note ?? ""), "");
    const samples = Array.isArray(fieldDiagnostics.samples) ? fieldDiagnostics.samples : [];
    if (!samples.length) {
        lines.push("尚未取得真实样本。执行同步后，如需核验阅读时长字段，可一并上传 `阅读系统/_数据/同步诊断-getprogress.json`。", "");
        return;
    }
    lines.push("| bookId | 样本类型 | 进度 | 候选字段 | 候选值 |", "|---|---|---:|---|---:|");
    for (const sample of samples) {
        lines.push(`| ${escapeCell(sample.bookId)} | ${escapeCell(sample.sampleKind)} | ${sample.progress ?? "—"} | ${escapeCell(sample.candidateField ?? "—")} | ${sample.candidateValue ?? "—"} |`);
    }
    lines.push("", "当前运行时优先使用 `book.readingTime`（秒）；字段缺失时依次回退到 `readingTime`、`book.recordReadingTime`、`recordReadingTime`。诊断表中的“候选字段”显示本次实际采用的字段。", "");
}
async function writeSyncDiagnostics(app, data) {
    const parent = constants_1.DIAGNOSTICS_PATH.split("/").slice(0, -1).join("/");
    await (0, utils_1.ensureDir)(app.vault.adapter, parent);
    if (!app.vault.getAbstractFileByPath(parent)) {
        try {
            await app.vault.createFolder(parent);
        }
        catch { /* adapter already created it */ }
    }
    await writeText(app, constants_1.DIAGNOSTICS_PATH, createSyncDiagnosticsMarkdown(data));
    const progressDiagnostics = sanitizeForExport(data?.sync?.progressFieldDiagnostics ?? {
        status: "awaiting-samples",
        note: "尚未取得真实 /book/getprogress 样本。",
        updatedAt: null,
        samples: [],
    });
    await writeText(app, constants_1.PROGRESS_DIAGNOSTICS_PATH, `${JSON.stringify(progressDiagnostics, null, 2)}\n`);
    const preferTimeDiagnostics = sanitizeForExport(data?.sync?.preferTimeDiagnostics ?? {
        generatedAt: data?.generator?.generatedAt ?? new Date().toISOString(),
        status: "not-collected",
        modes: {},
    });
    await writeText(app, constants_1.PREFERTIME_DIAGNOSTICS_PATH, `${JSON.stringify(preferTimeDiagnostics, null, 2)}\n`);
}
function sanitizeForExport(value) {
    if (Array.isArray(value))
        return value.map(sanitizeForExport);
    if (!value || typeof value !== "object")
        return value;
    const output = {};
    for (const [key, item] of Object.entries(value)) {
        output[key] = /authorization|token|secret|api.?key|cookie/i.test(key) ? "***" : sanitizeForExport(item);
    }
    return output;
}
async function openSyncDiagnostics(app) {
    const file = (0, utils_1.asVaultFile)(app, constants_1.DIAGNOSTICS_PATH);
    if (!file)
        return false;
    await app.workspace.getLeaf(false).openFile(file);
    return true;
}

},
"main.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");
const agent_client_1 = __wrd_require("api/agent-client.js");
const constants_1 = __wrd_require("constants.js");
const settings_1 = __wrd_require("settings.js");
const atomic_writer_1 = __wrd_require("data/atomic-writer.js");
const sync_manager_1 = __wrd_require("sync/sync-manager.js");
const settings_tab_1 = __wrd_require("ui/settings-tab.js");
class WereadReadingPlugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.settings = { ...settings_1.DEFAULT_SETTINGS };
    }
    async onload() {
        await this.loadSettings();
        this.syncManager = new sync_manager_1.SyncManager(this);
        // Startup never fetches or publishes remote WeRead data implicitly. The
        // consolidated scaffold may create one schema-valid empty reading-data
        // file so the dashboard has a canonical source before the first sync.
        await this.syncManager.init();
        this.addSettingTab(new settings_tab_1.WereadSettingTab(this.app, this));
        this.addCommand({ id: "quick-sync", name: "增量同步阅读数据", callback: () => void this.runSyncCommand("quick") });
        this.addCommand({ id: "full-sync", name: "完整重建阅读数据", callback: () => void this.runSyncCommand("full") });
        this.addCommand({ id: "refresh-diagnostics-data", name: "刷新故障诊断数据（不扫描书架）", callback: () => void this.syncManager.refreshPreferTimeDiagnostics().catch((error) => console.error("[Weread Reading Dashboard] refresh diagnostics data failed", error)) });
        this.addCommand({ id: "open-diagnostics", name: "查看同步诊断", callback: () => void this.syncManager.openDiagnostics() });
        if (!this.app.secretStorage)
            console.error("[Weread Reading Dashboard] 当前 Obsidian 不支持安全凭据存储，网络同步已禁用。");
    }
    async runSyncCommand(mode) {
        const syncMode = mode === "full" ? "full" : "quick";
        try {
            if (typeof this.ensureUiRuntimeReady === "function")
                await this.ensureUiRuntimeReady();
            if (this.navigation?.openHome)
                await this.navigation.openHome();
            if (this.syncController?.start) {
                this.syncController.start(syncMode);
                return;
            }
            const manager = this.syncManager;
            if (!manager)
                throw new Error("同步运行时尚未就绪");
            await (syncMode === "full" ? manager.fullSync() : manager.quickSync());
        }
        catch (error) {
            console.error(`[Weread Reading Dashboard] ${syncMode} sync command failed`, error);
            try {
                this.syncController?.accept?.({ phase: "failed", mode: syncMode, message: error instanceof Error ? error.message : String(error) });
            }
            catch (handoffError) {
                console.error("[Weread Reading Dashboard] sync command failure handoff failed", handoffError);
            }
        }
    }
    async loadSettings() {
        const loaded = await this.loadData();
        const bookOpenMode = ["browser", "webviewer"].includes(String(loaded?.bookOpenMode ?? ""))
            ? String(loaded.bookOpenMode)
            : settings_1.DEFAULT_SETTINGS.bookOpenMode;
        const quickSyncCooldownSeconds = Number.isFinite(Number(loaded?.quickSyncCooldownSeconds))
            ? Math.max(0, Number(loaded.quickSyncCooldownSeconds))
            : settings_1.DEFAULT_SETTINGS.quickSyncCooldownSeconds;
        const existingDeviceId = String(loaded?.deviceId ?? "").trim();
        this.settings = {
            quickSyncCooldownSeconds,
            bookOpenMode,
            deviceId: existingDeviceId || (0, settings_1.createDeviceId)(),
        };
        const cleanLoaded = loaded && typeof loaded === "object"
            && Object.keys(loaded).length === Object.keys(this.settings).length
            && Object.entries(this.settings).every(([key, value]) => loaded[key] === value);
        if (!cleanLoaded)
            await this.saveSettings();
    }
    async saveSettings() { await this.saveData(this.settings); }
    getApiKey() {
        const storage = this.app.secretStorage;
        if (!storage)
            return null;
        try {
            return storage.getSecret(constants_1.API_KEY_SECRET_ID) || null;
        }
        catch {
            return null;
        }
    }
    async saveApiKey(value) {
        const apiKey = value.trim();
        if (!apiKey)
            throw new Error("请输入微信读书 API Key。");
        if (!apiKey.startsWith("wrk-"))
            throw new Error("API Key 应以 wrk- 开头。");
        const storage = this.app.secretStorage;
        if (!storage || typeof storage.setSecret !== "function") {
            throw new Error("当前 Obsidian 不支持直接写入安全凭据，请升级到 1.11.4 或更高版本。");
        }
        storage.setSecret(constants_1.API_KEY_SECRET_ID, apiKey);
        await this.saveSettings();
    }
    async clearApiKey() {
        const storage = this.app.secretStorage;
        if (!storage || typeof storage.setSecret !== "function")
            return;
        if (typeof storage.deleteSecret === "function")
            storage.deleteSecret(constants_1.API_KEY_SECRET_ID);
        else
            storage.setSecret(constants_1.API_KEY_SECRET_ID, "");
        await this.saveSettings();
    }
    getMaskedApiKey() {
        const apiKey = this.getApiKey();
        if (!apiKey)
            return null;
        const suffix = apiKey.slice(-4);
        return `wrk-****${suffix}`;
    }
    async readPublishedReadingData() {
        // One strict canonical reader shared by diagnostics and every Native page.
        // Only a genuinely missing file returns null; invalid files throw.
        return await (0, atomic_writer_1.readPublishedReadingData)(this.app);
    }
    async ensureInitialReadingData() {
        return await (0, atomic_writer_1.ensureInitialReadingData)(this.app, {
            deviceId: this.settings.deviceId,
            bookOpenMode: this.settings.bookOpenMode,
        });
    }
    async testCandidateApiKey(value) {
        const apiKey = value.trim();
        if (!apiKey)
            throw new Error("请输入微信读书 API Key。");
        if (!apiKey.startsWith("wrk-"))
            throw new Error("API Key 应以 wrk- 开头。");
        const client = new agent_client_1.AgentClient(() => apiKey);
        await client.call("/shelf/sync");
    }

}
exports.default = WereadReadingPlugin;

},
"settings.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = void 0;
exports.createDeviceId = createDeviceId;
exports.DEFAULT_SETTINGS = {
    quickSyncCooldownSeconds: 60,
    bookOpenMode: "browser",
    deviceId: "",
};
function createDeviceId() {
    const random = Math.random().toString(36).slice(2, 10);
    return `wrd-${Date.now().toString(36)}-${random}`;
}

},
"sync/sync-manager.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncManager = void 0;
exports.inferHistoryStartYear = inferHistoryStartYear;
const obsidian_1 = require("obsidian");
const agent_client_1 = __wrd_require("api/agent-client.js");
const errors_1 = __wrd_require("api/errors.js");
const pagination_1 = __wrd_require("api/pagination.js");
const cache_manager_1 = __wrd_require("cache/cache-manager.js");
const signatures_1 = __wrd_require("cache/signatures.js");
const cover_cache_1 = __wrd_require("covers/cover-cache.js");
const atomic_writer_1 = __wrd_require("data/atomic-writer.js");
const validator_1 = __wrd_require("data/validator.js");
const normalizer_1 = __wrd_require("data/normalizer.js");
const view_model_builder_1 = __wrd_require("data/view-model-builder.js");
const aggregators_1 = __wrd_require("data/aggregators.js");
const constants_1 = __wrd_require("constants.js");
const sync_diagnostics_1 = __wrd_require("diagnostics/sync-diagnostics.js");
const progress_samples_1 = __wrd_require("diagnostics/progress-samples.js");
const utils_1 = __wrd_require("utils.js");
function isFatalSyncError(error) {
    return error?.code === "WRD_SKILL_UPGRADE_REQUIRED" || error?.status === 401 || error?.status === 403;
}
function yearFromHistoryToken(value, currentYear) {
    const text = String(value ?? "").trim();
    if (/^\d{4}$/.test(text)) {
        const year = Number(text);
        return year >= 2000 && year <= currentYear ? year : null;
    }
    const direct = text.match(/(?:^|\D)(20\d{2})(?:\D|$)/)?.[1];
    if (direct) {
        const year = Number(direct);
        if (year >= 2000 && year <= currentYear)
            return year;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 100000000) {
        const key = (0, utils_1.shanghaiDateKey)(numeric);
        const year = Number(key?.slice(0, 4));
        return Number.isFinite(year) && year >= 2000 && year <= currentYear ? year : null;
    }
    return null;
}
function inferHistoryStartYear(overall, currentYear) {
    const candidates = [];
    const registered = yearFromHistoryToken(overall?.registTime, currentYear);
    if (registered)
        candidates.push({ year: registered, source: "overall.registTime" });
    for (const key of Object.keys(overall?.readTimes && typeof overall.readTimes === "object" ? overall.readTimes : {})) {
        const year = yearFromHistoryToken(key, currentYear);
        if (year)
            candidates.push({ year, source: "overall.readTimes" });
    }
    for (const row of (0, utils_1.asArray)(overall?.yearReport)) {
        for (const [field, value] of [["year", row?.year], ["baseTime", row?.baseTime], ["startTime", row?.startTime], ["title", row?.title]]) {
            const year = yearFromHistoryToken(value, currentYear);
            if (year)
                candidates.push({ year, source: `overall.yearReport.${field}` });
        }
    }
    if (!candidates.length)
        return null;
    return candidates.sort((a, b) => a.year - b.year)[0];
}
class SyncManager {
    constructor(host) {
        this.host = host;
        this.running = null;
        this.cache = new cache_manager_1.CacheManager(host.app);
        this.covers = new cover_cache_1.CoverCache(host.app);
    }
    async init() { await this.cache.init(); }
    async collectPublicationHealth() {
        const path = constants_1.OUTPUT_PATH;
        const health = { path, exists: false, readable: false, bytes: null, schemaVersion: null, generatedAt: null, books: null, highlights: null, thoughts: null, error: null };
        try {
            const candidate = await (0, atomic_writer_1.readPublishedReadingData)(this.host.app);
            if (!candidate)
                return health;
            health.exists = true;
            health.readable = true;
            health.bytes = typeof candidate.raw === "string" ? candidate.raw.length : null;
            health.schemaVersion = candidate.data?.schemaVersion ?? null;
            health.generatedAt = candidate.data?.generator?.generatedAt ?? null;
            health.books = Object.keys(candidate.data?.entities?.booksById ?? {}).length;
            health.highlights = Object.keys(candidate.data?.entities?.highlightsById ?? {}).length;
            health.thoughts = Object.keys(candidate.data?.entities?.thoughtsById ?? {}).length;
        }
        catch (error) {
            health.exists = await this.host.app.vault.adapter.exists(path).catch(() => false);
            health.error = error instanceof Error ? error.message : String(error);
        }
        return health;
    }
    async quickSync() { return this.withLock(() => this.run("quick")); }
    async fullSync() { return this.withLock(() => this.run("full")); }
    async refreshPreferTimeDiagnostics() { return this.withLock(() => this.runPreferTimeDiagnostics()); }
    async runPreferTimeDiagnostics() {
        await this.init();
        if (!this.host.getApiKey())
            throw new Error("未配置 API Key");
        const client = new agent_client_1.AgentClient(() => this.host.getApiKey());
        const now = new Date();
        const monthKey = (0, utils_1.monthKey)(now);
        const modes = {};
        const specs = ["weekly", "monthly", "annually", "overall"];
        for (const mode of specs) {
            try {
                const payload = await client.call("/readdata/detail", { mode, baseTime: 0 });
                const captured = {
                    ...(payload && typeof payload === "object" ? payload : {}),
                    __wrdRequestedMode: mode,
                    __wrdRequestedBaseTime: 0,
                };
                if (mode === "overall")
                    await this.cache.writeJson("stats/overall.json", captured);
                modes[mode] = summarizeStatPayload(mode, captured);
            }
            catch (error) {
                if (isFatalSyncError(error))
                    throw error;
                modes[mode] = {
                    ...summarizeStatPayload(mode, null),
                    requestError: error instanceof Error ? error.message : String(error),
                };
            }
        }
        const overall = modes.overall;
        let status = "available";
        if (!overall?.cachePresent)
            status = overall?.requestError ? "overall-request-failed" : "overall-response-missing";
        else if (!overall.preferTime.present)
            status = "preferTime-missing";
        else if (overall.preferTime.type !== "array")
            status = "preferTime-not-array";
        else if (overall.preferTime.buckets !== 24)
            status = "preferTime-bucket-count-invalid";
        else if (!overall.preferTime.normalizedValid)
            status = "normalize-failed";
        else if ((overall.preferTime.sumSeconds ?? 0) <= 0)
            status = "preferTime-all-zero";
        const diagnostics = { generatedAt: (0, utils_1.nowIso)(), monthKey, status, source: "live-direct-no-cache", modes };
        let existing = null;
        try {
            existing = await (0, atomic_writer_1.readPublishedReadingDataValue)(this.host.app);
        }
        catch (error) {
            console.warn("[Weread Reading Dashboard] preferTime probe cannot read canonical data; diagnostics only", error);
        }
        const progressFieldDiagnostics = await (0, progress_samples_1.loadProgressFieldDiagnostics)(this.cache);
        const nowIso = (0, utils_1.nowIso)();
        const data = existing ? JSON.parse(JSON.stringify(existing)) : {
            schemaVersion: 1,
            generator: { pluginId: constants_1.PLUGIN_ID, pluginName: constants_1.PLUGIN_NAME, pluginVersion: constants_1.PLUGIN_VERSION, wereadSkillVersion: constants_1.WEREAD_SKILL_VERSION, generatedAt: nowIso },
            sync: { status: "diagnostics-only", mode: "none", lastAttemptAt: null, lastSuccessAt: null, warnings: [], retryQueue: { books: 0, entries: [] } },
            entities: { booksById: {}, highlightsById: {}, thoughtsById: {}, reviewsById: {} },
        };
        data.generator = { ...(data.generator ?? {}), pluginVersion: constants_1.PLUGIN_VERSION };
        const overallProbe = modes.overall?.preferTime;
        let canonicalUpdated = false;
        if (existing && overallProbe?.normalizedValid && Array.isArray(overallProbe.normalized00To23) && overallProbe.normalized00To23.length === 24) {
            data.reading = data.reading ?? {};
            data.reading.overall = data.reading.overall ?? {};
            data.reading.overall.preferTimeSeconds = overallProbe.normalized00To23.map((value) => Math.max(0, Number(value) || 0));
            data.reading.overall.preferTimeAsOf = diagnostics.generatedAt;
            data.generator.generatedAt = diagnostics.generatedAt;
            canonicalUpdated = true;
        }
        data.sync = {
            ...(data.sync ?? {}),
            preferTimeDiagnostics: diagnostics,
            apiDiagnostics: client.getDiagnostics(),
            progressFieldDiagnostics,
            publicationHealth: await this.collectPublicationHealth(),
            uiConsumptionHealth: this.host.dataStore?.inspectHealth?.() ?? null,
        };
        if (canonicalUpdated) {
            await (0, atomic_writer_1.publishReadingData)(this.host.app, data);
            await this.refreshPublishedUi("prefertime-overall-updated", data);
            data.sync.publicationHealth = await this.collectPublicationHealth();
            data.sync.uiConsumptionHealth = this.host.dataStore?.inspectHealth?.() ?? null;
        }
        await (0, sync_diagnostics_1.writeSyncDiagnostics)(this.host.app, data);
        await (0, sync_diagnostics_1.openSyncDiagnostics)(this.host.app);
        return diagnostics;
    }
    async openDiagnostics() {
        let opened = false;
        try {
            let existing = null;
            let existingReadError = null;
            try {
                existing = await (0, atomic_writer_1.readPublishedReadingDataValue)(this.host.app);
            }
            catch (error) {
                existingReadError = error instanceof Error ? error.message : String(error);
            }
            const progressFieldDiagnostics = await (0, progress_samples_1.loadProgressFieldDiagnostics)(this.cache);
            const now = (0, utils_1.nowIso)();
            const data = existing ?? {
                schemaVersion: 1,
                generator: {
                    pluginId: constants_1.PLUGIN_ID,
                    pluginName: constants_1.PLUGIN_NAME,
                    pluginVersion: constants_1.PLUGIN_VERSION,
                    wereadSkillVersion: constants_1.WEREAD_SKILL_VERSION,
                    deviceId: this.host.settings.deviceId,
                    generatedAt: now,
                },
                sync: {
                    status: existingReadError ? "data-read-failed" : "not-synced", mode: "none", lastAttemptAt: null, lastSuccessAt: null,
                    warnings: [{
                        code: existingReadError ? "published-data-invalid" : "not-synced",
                        message: existingReadError ?? (this.host.getApiKey() ? "插件已加载并已配置 API Key，但尚未生成 reading-data。请执行一次刷新或重新完整同步。" : "插件已加载，但尚未配置 API Key / 尚未执行首次同步。")
                    }],
                    apiDiagnostics: null, retryQueue: { books: 0, entries: [] }, progressFieldDiagnostics,
                },
                entities: { booksById: {}, highlightsById: {}, thoughtsById: {}, reviewsById: {} },
            };
            if (existing) {
                data.generator = { ...(data.generator ?? {}), pluginVersion: constants_1.PLUGIN_VERSION, wereadSkillVersion: constants_1.WEREAD_SKILL_VERSION, generatedAt: now };
                data.sync = { ...(data.sync ?? {}), progressFieldDiagnostics: data.sync?.progressFieldDiagnostics ?? progressFieldDiagnostics };
            }
            data.sync = {
                ...(data.sync ?? {}),
                publicationHealth: await this.collectPublicationHealth(),
                uiConsumptionHealth: this.host.dataStore?.inspectHealth?.() ?? null,
            };
            await (0, sync_diagnostics_1.writeSyncDiagnostics)(this.host.app, data);
            opened = await (0, sync_diagnostics_1.openSyncDiagnostics)(this.host.app);
        }
        catch (error) {
            console.error("[Weread Reading Dashboard] generate diagnostics failed", error);
        }
        if (!opened)
            console.error(`[Weread Reading Dashboard] 诊断文件生成失败：${constants_1.DIAGNOSTICS_PATH}`);
    }
    withLock(task) {
        if (this.running)
            return this.running;
        this.running = task().finally(() => { this.running = null; });
        return this.running;
    }
    emitSyncState(payload) {
        // Single active sync-state path: the sync runtime talks directly to the
        // installed UI controller when it exists. Command palette/settings syncs
        // still work when no dashboard view is open.
        try { this.host.syncController?.accept?.(payload); }
        catch (error) { console.error("[Weread Reading Dashboard] sync state handoff failed", error); }
    }
    async refreshPublishedUi(reason = "sync-published", expectedData = null) {
        const store = this.host.dataStore;
        if (!store || typeof store.reload !== "function")
            return null;
        let snapshot;
        try {
            snapshot = await store.reload(reason, { force: true });
        }
        catch (error) {
            const wrapped = new Error(`看板无法读取已发布 reading-data：${error instanceof Error ? error.message : String(error)}`);
            wrapped.code = "WRD_UI_RELOAD_FAILED";
            wrapped.cause = error;
            console.error("[Weread Reading Dashboard] published reading-data UI reload failed", wrapped);
            throw wrapped;
        }
        if (expectedData) {
            const expected = (0, validator_1.readingDataSummary)(expectedData);
            const actual = (0, validator_1.readingDataSummary)(snapshot?.data ?? null);
            const mismatch = expected.books !== actual.books || expected.highlights !== actual.highlights || expected.thoughts !== actual.thoughts || expected.reviews !== actual.reviews;
            if (mismatch) {
                const error = new Error(`reading-data 已发布但看板消费结果不一致：books ${expected.books}→${actual.books}, highlights ${expected.highlights}→${actual.highlights}, thoughts ${expected.thoughts}→${actual.thoughts}, reviews ${expected.reviews}→${actual.reviews}`);
                error.code = "WRD_UI_CONSUMPTION_MISMATCH";
                console.error("[Weread Reading Dashboard]", error);
                throw error;
            }
        }
        return snapshot;
    }
    async run(mode) {
        const lifecycleRunId = globalThis.crypto?.randomUUID?.() ?? `sync-${Date.now()}-${Math.random()}`;
        const startedAt = (0, utils_1.nowIso)();
        this.emitSyncState({ phase: "starting", mode, runId: lifecycleRunId, startedAt });
        await this.init();
        const index = await this.cache.loadIndex();
        let quickCanonical = null;
        if (mode === "quick") {
            try {
                quickCanonical = await (0, atomic_writer_1.readPublishedReadingDataValue)(this.host.app);
            }
            catch (error) {
                const wrapped = new Error(`现有 reading-data 无法读取或校验：${error instanceof Error ? error.message : String(error)}。请执行完整同步进行修复。`);
                wrapped.code = "WRD_DATA_REPAIR_REQUIRES_FULL_SYNC";
                wrapped.cause = error;
                const message = wrapped.message;
                this.emitSyncState({ phase: "failed", mode, runId: lifecycleRunId, status: "needs-full-repair", message, completedAt: (0, utils_1.nowIso)() });
                throw wrapped;
            }
        }
        if (mode === "quick" && index.lastQuickSyncAt && Date.now() - new Date(index.lastQuickSyncAt).getTime() < this.host.settings.quickSyncCooldownSeconds * 1000) {
            const data = quickCanonical;
            if (data) {
                const count = Object.keys(data.entities?.booksById ?? {}).length;
                await this.refreshPublishedUi("sync-cooldown", data);
                this.emitSyncState({ phase: "completed", mode, runId: lifecycleRunId, status: data.sync?.status ?? "ready", books: count, completedAt: (0, utils_1.nowIso)(), cooldown: true });
                return;
            }
        }
        if (!this.host.getApiKey()) {
            this.emitSyncState({ phase: "failed", mode, runId: lifecycleRunId, status: "missing-api-key", message: "未配置 API Key", completedAt: (0, utils_1.nowIso)() });
            throw new Error("未配置 API Key");
        }
        const warnings = [];
        const client = new agent_client_1.AgentClient(() => this.host.getApiKey());
        const attemptAt = (0, utils_1.nowIso)();
        try {
            await this.syncRemote(mode, client, index, warnings, lifecycleRunId);
            warnings.push(...client.warnings);
            const data = await this.buildAndWrite(mode, index, warnings, client.upgradeInfo, attemptAt, client.getDiagnostics());
            const completedAt = (0, utils_1.nowIso)();
            if (mode === "full")
                index.lastFullSyncAt = completedAt;
            index.lastQuickSyncAt = completedAt;
            await this.cache.saveIndex(index);
            const bookCount = Object.keys(data.entities.booksById).length;
            const highlightCount = Object.keys(data.entities.highlightsById).length;
            const thoughtCount = Object.keys(data.entities.thoughtsById).length;
            const retryBooks = Object.keys(index.retryQueue).length;
            this.emitSyncState({
                phase: "completed", mode, runId: lifecycleRunId, status: data.sync.status,
                books: bookCount, highlights: highlightCount, thoughts: thoughtCount,
                warnings: warnings.length, retryBooks, completedAt: (0, utils_1.nowIso)()
            });
        }
        catch (error) {
            if (error?.code === "WRD_PARTIAL_PUBLISH_BLOCKED") {
                console.warn("[Weread Reading Dashboard] partial sync publication blocked; preserving current published reading-data", error);
                await this.cache.saveIndex(index);
                const preserved = await (0, atomic_writer_1.readPublishedReadingDataValue)(this.host.app);
                const message = error instanceof Error ? error.message : String(error);
                this.emitSyncState({ phase: "completed", mode, runId: lifecycleRunId, status: "partial-protected", message, completedAt: (0, utils_1.nowIso)() });
                if (preserved) await this.refreshPublishedUi("sync-partial-protected", preserved);
                return;
            }
            if (String(error?.code ?? "").startsWith("WRD_UI_")) {
                console.error("[Weread Reading Dashboard] sync data published but dashboard consumption failed", error);
                await this.cache.saveIndex(index);
                const message = error instanceof Error ? error.message : String(error);
                this.emitSyncState({ phase: "failed", mode, runId: lifecycleRunId, status: "ui-consumption-failed", message, completedAt: (0, utils_1.nowIso)() });
                throw error;
            }
            if (error?.code === "WRD_SKILL_UPGRADE_REQUIRED") {
                console.error("[Weread Reading Dashboard] WeRead skill upgrade required; sync stopped before further publication", error);
                await this.cache.saveIndex(index);
                warnings.push({ code: "skill-upgrade-required", message: error instanceof Error ? error.message : String(error), context: { upgradeInfo: error?.upgradeInfo ?? null } });
                await this.markFailure(error, attemptAt, warnings, client.getDiagnostics(), index);
                const message = error instanceof Error ? error.message : String(error);
                this.emitSyncState({ phase: "failed", mode, runId: lifecycleRunId, status: "skill-upgrade-required", message, completedAt: (0, utils_1.nowIso)() });
                throw error;
            }
            console.error("[Weread Reading Dashboard] sync failed", error);
            await this.cache.saveIndex(index);
            await this.markFailure(error, attemptAt, warnings, client.getDiagnostics(), index);
            const message = error instanceof Error ? error.message : String(error);
            this.emitSyncState({ phase: "failed", mode, runId: lifecycleRunId, status: "failed", message, completedAt: (0, utils_1.nowIso)() });
            throw error;
        }
    }
    async syncRemote(mode, client, index, warnings, lifecycleRunId) {
        const full = mode === "full";
        const shelf = await this.getOrFetchShelf(client, index, full, warnings);
        const shelfBooks = (0, utils_1.asArray)(shelf?.books);
        if (!shelfBooks.length)
            warnings.push({ code: "empty-shelf", message: "电子书书架为空或接口未返回 books。" });
        const notebooksResult = await this.getOrFetchNotebooks(client, index, full);
        warnings.push(...notebooksResult.warnings);
        const notebookMap = new Map(notebooksResult.items.map((row) => [(0, utils_1.asString)(row.bookId ?? row.book?.bookId), row]));
        const oldShelfSignatures = { ...index.shelfSignatures };
        const oldNoteSignatures = { ...index.noteSignatures };
        index.shelfSignatures = {};
        index.noteSignatures = {};
        for (const book of shelfBooks)
            index.shelfSignatures[(0, utils_1.asString)(book.bookId)] = (0, signatures_1.shelfSignature)(book);
        for (const row of notebooksResult.items)
            index.noteSignatures[(0, utils_1.asString)(row.bookId ?? row.book?.bookId)] = (0, signatures_1.noteSignature)(row);
        const queuedIds = new Set(Object.keys(index.retryQueue));
        const syncableBooks = shelfBooks.filter((book) => !book?._wrdDeletedRemoteCandidate);
        const shouldQuickSyncBook = (book) => {
            const bookId = (0, utils_1.asString)(book?.bookId);
            if (!bookId)
                return false;
            if (queuedIds.has(bookId))
                return true;
            if (!oldShelfSignatures[bookId] || oldShelfSignatures[bookId] !== index.shelfSignatures[bookId])
                return true;
            if (oldNoteSignatures[bookId] !== index.noteSignatures[bookId])
                return true;
            if (!index.bookFetchedAt[bookId])
                return true;
            return false;
        };
        const candidateBooks = full ? syncableBooks : syncableBooks.filter(shouldQuickSyncBook);
        const orderedBooks = [
            ...candidateBooks.filter((book) => queuedIds.has((0, utils_1.asString)(book.bookId))),
            ...candidateBooks.filter((book) => !queuedIds.has((0, utils_1.asString)(book.bookId))),
        ];
        this.emitSyncState({ phase: "progress", mode, runId: lifecycleRunId, stage: "books", processed: 0, total: orderedBooks.length });
        for (let offset = 0; offset < orderedBooks.length; offset += constants_1.BOOK_SYNC_BATCH_SIZE) {
            const batch = orderedBooks.slice(offset, offset + constants_1.BOOK_SYNC_BATCH_SIZE);
            const attemptsBefore = client.getTotalAttempts();
            await (0, utils_1.mapConcurrent)(batch, 1, async (shelfBook) => {
                const bookId = (0, utils_1.asString)(shelfBook.bookId);
                if (!bookId)
                    return;
                try {
                    const notebook = notebookMap.get(bookId) ?? null;
                    await this.syncBook(client, index, shelfBook, notebook, full, oldShelfSignatures[bookId], oldNoteSignatures[bookId], warnings);
                }
                catch (error) {
                    if (isFatalSyncError(error))
                        throw error;
                    warnings.push({ code: "book-sync-unexpected", message: `《${shelfBook.title ?? bookId}》发生未分类同步错误：${error instanceof Error ? error.message : String(error)}`, context: { bookId } });
                }
            });
            await this.cache.saveIndex(index);
            this.emitSyncState({ phase: "progress", mode, runId: lifecycleRunId, stage: "books", processed: Math.min(offset + batch.length, orderedBooks.length), total: orderedBooks.length });
            if (offset + constants_1.BOOK_SYNC_BATCH_SIZE < orderedBooks.length && client.getTotalAttempts() > attemptsBefore) {
                await (0, utils_1.sleep)(randomBetween(constants_1.BOOK_SYNC_PAUSE_MIN_MS, constants_1.BOOK_SYNC_PAUSE_MAX_MS));
            }
        }
        await this.syncCurrentStats(client, index, full, warnings);
        if (full)
            await this.syncHistory(client, index, warnings);
    }
    async getOrFetchShelf(client, index, force, warnings) {
        const cached = await this.cache.readJson("shelf.json", null);
        if (!force && cached && (0, utils_1.isFresh)(index.fetchedAt.shelf, constants_1.TTL.shelf))
            return cached;
        const fresh = await client.call("/shelf/sync");
        const freshBooks = (0, utils_1.asArray)(fresh?.books);
        const cachedBooks = (0, utils_1.asArray)(cached?.books);
        if (!freshBooks.length && cachedBooks.length) {
            warnings.push({ code: "shelf-empty-preserved", message: "书架接口本次返回空列表，已保留上次成功书架，避免误清空 Dashboard。" });
            return cached;
        }
        let books = freshBooks;
        const deletionCandidates = index.shelfDeletionCandidates ?? (index.shelfDeletionCandidates = {});
        const freshIds = new Set(freshBooks.map((book) => (0, utils_1.asString)(book?.bookId)).filter(Boolean));
        for (const id of freshIds)
            delete deletionCandidates[id];
        if (cachedBooks.length) {
            const missing = cachedBooks.filter((book) => !freshIds.has((0, utils_1.asString)(book?.bookId)));
            if (missing.length && !force) {
                books = [...freshBooks, ...missing.map((book) => ({ ...book, _wrdDeletedRemoteCandidate: true }))];
                warnings.push({ code: "shelf-deletion-pending", message: `${missing.length} 本书暂未出现在远端书架，快速同步不确认删除；需连续两次完整同步均缺失后才移除。` });
            }
            else if (missing.length && force) {
                const pending = [];
                const now = (0, utils_1.nowIso)();
                for (const book of missing) {
                    const id = (0, utils_1.asString)(book?.bookId);
                    if (!id)
                        continue;
                    const prior = deletionCandidates[id];
                    if (Number(prior?.confirmations ?? 0) >= 1) {
                        delete deletionCandidates[id];
                        delete index.retryQueue[id];
                        delete index.bookFetchedAt[id];
                        delete index.progressSignatures[id];
                        delete index.noteSignatures[id];
                        continue;
                    }
                    deletionCandidates[id] = {
                        bookId: id,
                        title: (0, utils_1.asString)(book?.title),
                        confirmations: 1,
                        firstMissingAt: prior?.firstMissingAt ?? now,
                        lastMissingAt: now,
                    };
                    pending.push({ ...book, _wrdDeletedRemoteCandidate: true });
                }
                if (pending.length) {
                    books = [...freshBooks, ...pending];
                    warnings.push({ code: "shelf-deletion-pending", message: `${pending.length} 本书在本次完整同步中首次缺失，已暂时保留；若下次完整同步仍缺失才确认删除。` });
                }
            }
        }
        const merged = { ...fresh, books };
        await this.cache.writeJson("shelf.json", merged);
        index.fetchedAt.shelf = (0, utils_1.nowIso)();
        return merged;
    }
    async getOrFetch(key, file, ttl, force, index, fetcher) {
        const cached = await this.cache.readJson(file, null);
        if (!force && cached && (0, utils_1.isFresh)(index.fetchedAt[key], ttl))
            return cached;
        const fresh = await fetcher();
        await this.cache.writeJson(file, fresh);
        index.fetchedAt[key] = (0, utils_1.nowIso)();
        return fresh;
    }
    async getOrFetchNotebooks(client, index, force) {
        const cached = await this.cache.readJson("notebooks.json", null);
        if (!force && cached && (0, utils_1.isFresh)(index.fetchedAt.notebooks, constants_1.TTL.notebooks))
            return cached;
        const result = await (0, pagination_1.fetchAllNotebooks)(client);
        if (!result.complete && (0, utils_1.asArray)(cached?.items).length) {
            const byId = new Map();
            for (const row of (0, utils_1.asArray)(cached.items))
                byId.set((0, utils_1.asString)(row?.bookId ?? row?.book?.bookId), row);
            for (const row of result.items)
                byId.set((0, utils_1.asString)(row?.bookId ?? row?.book?.bookId), row);
            result.items = [...byId.values()].filter((row) => (0, utils_1.asString)(row?.bookId ?? row?.book?.bookId));
            result.warnings.push({ code: "notebooks-partial-merged", message: "笔记本概览分页不完整，已与上次缓存合并，避免笔记误删。" });
        }
        await this.cache.writeJson("notebooks.json", result);
        index.fetchedAt.notebooks = (0, utils_1.nowIso)();
        return result;
    }
    async syncBook(client, index, shelfBook, notebook, full, oldShelfSig, oldNoteSig, warnings) {
        const bookId = (0, utils_1.asString)(shelfBook.bookId);
        const title = (0, utils_1.asString)(shelfBook.title, bookId);
        const fetched = index.bookFetchedAt[bookId] ?? (index.bookFetchedAt[bookId] = {});
        const pending = new Set(Object.keys(index.retryQueue[bookId]?.pending ?? {}));
        let info = await this.cache.readJson(`books/${(0, utils_1.safeId)(bookId)}.json`, null);
        if (full || pending.has("book-info") || !info) {
            try {
                info = await client.call("/book/info", { bookId });
                await this.cache.writeJson(`books/${(0, utils_1.safeId)(bookId)}.json`, info);
                fetched.info = (0, utils_1.nowIso)();
                this.markEndpointSuccess(index, bookId, "book-info");
            }
            catch (error) {
                this.markEndpointFailure(index, bookId, title, "book-info", "/book/info", error);
                warnings.push(this.endpointWarning("book-info", "/book/info", title, bookId, error, Boolean(info)));
            }
        }
        let progress = await this.cache.readJson(`progress/${(0, utils_1.safeId)(bookId)}.json`, null);
        const shelfChanged = oldShelfSig !== index.shelfSignatures[bookId];
        if (full || pending.has("book-progress") || !progress || shelfChanged) {
            try {
                progress = await client.call("/book/getprogress", { bookId });
                await this.cache.writeJson(`progress/${(0, utils_1.safeId)(bookId)}.json`, progress);
                await (0, progress_samples_1.recordProgressFieldSample)(this.cache, bookId, progress);
                fetched.progress = (0, utils_1.nowIso)();
                this.markEndpointSuccess(index, bookId, "book-progress");
            }
            catch (error) {
                this.markEndpointFailure(index, bookId, title, "book-progress", "/book/getprogress", error);
                warnings.push(this.endpointWarning("book-progress", "/book/getprogress", title, bookId, error, Boolean(progress)));
            }
        }
        if (progress)
            index.progressSignatures[bookId] = (0, signatures_1.progressSignature)(progress);
        const localCover = `阅读系统/_数据/assets/covers/${(0, utils_1.safeId)(bookId)}.jpg`;
        const localExists = await this.host.app.vault.adapter.exists(localCover);
        if (!localExists && (info?.cover || shelfBook.cover)) {
            const saved = await this.covers.cache(bookId, (0, utils_1.asString)(info?.cover ?? shelfBook.cover));
            if (saved)
                fetched.cover = (0, utils_1.nowIso)();
            else
                warnings.push({ code: "cover-download-failed", message: `《${title}》封面下载失败，继续使用远程封面。`, context: { bookId } });
        }
        const currentNoteSig = notebook ? index.noteSignatures[bookId] : undefined;
        const notesCache = await this.cache.readJson(`notes/${(0, utils_1.safeId)(bookId)}.json`, null);
        const noteChanged = currentNoteSig !== oldNoteSig;
        const canSyncNotes = Boolean(notebook) || pending.has("book-bookmark") || pending.has("book-review");
        let highlights = (0, utils_1.asArray)(notesCache?.highlights);
        let thoughts = (0, utils_1.asArray)(notesCache?.thoughts);
        let reviews = (0, utils_1.asArray)(notesCache?.reviews);
        let bookmarkComplete = Boolean(notesCache?.bookmarkComplete ?? notesCache);
        let reviewsComplete = Boolean(notesCache?.reviewsComplete ?? notesCache?.complete);
        let notesChanged = false;
        const needBookmark = canSyncNotes && (full || pending.has("book-bookmark") || !notesCache || noteChanged);
        if (needBookmark) {
            try {
                const bookmarkPayload = await client.call("/book/bookmarklist", { bookId });
                let nextHighlights = (0, normalizer_1.normalizeHighlights)(bookId, bookmarkPayload, (0, utils_1.asString)(info?.deepLink ?? shelfBook.deepLink));
                if (!(0, utils_1.asArray)(bookmarkPayload?.updated).length && highlights.length && Number(notebook?.noteCount ?? 0) > 0) {
                    nextHighlights = highlights;
                    warnings.push({ code: "highlights-empty-preserved", message: `《${title}》划线接口本次为空，已保留上次缓存。`, context: { bookId, apiName: "/book/bookmarklist" } });
                }
                highlights = nextHighlights;
                bookmarkComplete = true;
                notesChanged = true;
                fetched.bookmark = (0, utils_1.nowIso)();
                this.markEndpointSuccess(index, bookId, "book-bookmark");
            }
            catch (error) {
                bookmarkComplete = false;
                this.markEndpointFailure(index, bookId, title, "book-bookmark", "/book/bookmarklist", error);
                warnings.push(this.endpointWarning("book-bookmark", "/book/bookmarklist", title, bookId, error, Boolean(notesCache)));
            }
        }
        const needReviews = canSyncNotes && (full || pending.has("book-review") || !notesCache || noteChanged);
        if (needReviews) {
            try {
                const reviewsResult = await (0, pagination_1.fetchAllReviews)(client, bookId);
                warnings.push(...reviewsResult.warnings);
                const normalized = (0, normalizer_1.normalizeReviews)(bookId, reviewsResult.items, (0, utils_1.asString)(info?.deepLink ?? shelfBook.deepLink));
                if (!reviewsResult.complete) {
                    thoughts = notesCache ? mergeById(thoughts, normalized.thoughts) : normalized.thoughts;
                    reviews = notesCache ? mergeById(reviews, normalized.reviews) : normalized.reviews;
                    reviewsComplete = false;
                    const partialError = new errors_1.WereadApiError("想法分页结果不完整。", null, null, true, 1);
                    this.markEndpointFailure(index, bookId, title, "book-review", "/review/list/mine", partialError);
                    warnings.push({ code: "book-review-partial", message: `《${title}》想法分页不完整，已${notesCache ? "合并上次缓存并" : "保存当前分页并"}加入补齐队列。`, context: { bookId, apiName: "/review/list/mine" } });
                }
                else {
                    thoughts = normalized.thoughts;
                    reviews = normalized.reviews;
                    reviewsComplete = true;
                    fetched.review = (0, utils_1.nowIso)();
                    this.markEndpointSuccess(index, bookId, "book-review");
                }
                notesChanged = true;
            }
            catch (error) {
                reviewsComplete = false;
                this.markEndpointFailure(index, bookId, title, "book-review", "/review/list/mine", error);
                warnings.push(this.endpointWarning("book-review", "/review/list/mine", title, bookId, error, Boolean(notesCache)));
            }
        }
        if (notesChanged) {
            await this.cache.writeJson(`notes/${(0, utils_1.safeId)(bookId)}.json`, {
                highlights, thoughts, reviews, bookmarkComplete, reviewsComplete,
                complete: bookmarkComplete && reviewsComplete, asOf: (0, utils_1.nowIso)(),
            });
            if (bookmarkComplete && reviewsComplete)
                fetched.notes = (0, utils_1.nowIso)();
        }
    }
    markEndpointSuccess(index, bookId, endpoint) {
        const entry = index.retryQueue[bookId];
        if (!entry)
            return;
        delete entry.pending[endpoint];
        if (!Object.keys(entry.pending).length)
            delete index.retryQueue[bookId];
    }
    markEndpointFailure(index, bookId, title, endpoint, apiName, rawError) {
        const error = asApiError(rawError);
        if (isFatalSyncError(error))
            throw error;
        const at = (0, utils_1.nowIso)();
        const entry = index.retryQueue[bookId] ?? {
            bookId, title, firstFailedAt: at, lastFailedAt: at, pending: {},
        };
        const old = entry.pending[endpoint];
        entry.title = title;
        entry.lastFailedAt = at;
        entry.pending[endpoint] = {
            apiName, status: error.status, errcode: error.errcode, message: error.message, attempts: error.attempts,
            firstFailedAt: old?.firstFailedAt ?? at, lastFailedAt: at,
        };
        index.retryQueue[bookId] = entry;
    }
    endpointWarning(endpoint, apiName, title, bookId, rawError, hasCache) {
        const error = asApiError(rawError);
        const suffix = error.status !== null ? `http-${error.status}` : error.errcode !== null ? `errcode-${String(error.errcode).replace(/^-/, "minus-")}` : "network";
        return {
            code: `${endpoint}-${suffix}`,
            message: `《${title}》${apiName} 失败${hasCache ? "，已保留旧缓存" : "，当前字段仍缺失"}：${error.message}`,
            context: { bookId, apiName, status: error.status, errcode: error.errcode, attempts: error.attempts, retryable: error.retryable },
        };
    }
    async syncCurrentStats(client, index, full, warnings) {
        const now = new Date();
        await this.fetchStat(client, index, "weekly", 0, `stats/weeks/${this.currentWeekKey(now)}.json`, "stats-current-week", constants_1.TTL.currentWeek, full, warnings, true);
        await this.fetchStat(client, index, "monthly", 0, `stats/months/${(0, utils_1.monthKey)(now)}.json`, "stats-current-month", constants_1.TTL.currentMonth, full, warnings, true);
        await this.fetchStat(client, index, "annually", 0, `stats/years/${(0, utils_1.yearKey)(now)}.json`, "stats-current-year", constants_1.TTL.currentYear, full, warnings, true);
        await this.fetchStat(client, index, "overall", 0, "stats/overall.json", "stats-overall", constants_1.TTL.overall, full, warnings, true);
        const parts = (0, utils_1.shanghaiParts)(now);
        if (parts.day <= 7) {
            const previous = new Date(Date.UTC(parts.year, parts.month - 2, 15));
            await this.fetchStat(client, index, "monthly", (0, utils_1.startOfShanghaiPeriodTimestamp)("monthly", previous), `stats/months/${(0, utils_1.monthKey)(previous)}.json`, `stats-month-${(0, utils_1.monthKey)(previous)}`, 24 * 60 * 60000, full, warnings, true);
            // New-year grace period: the previous year may still receive delayed/offline
            // reading uploads, so verify it once per day during the first seven days.
            if (parts.month === 1) {
                const previousYear = new Date(Date.UTC(parts.year - 1, 6, 1));
                await this.fetchStat(client, index, "annually", (0, utils_1.startOfShanghaiPeriodTimestamp)("annually", previousYear), `stats/years/${parts.year - 1}.json`, `stats-year-${parts.year - 1}`, 24 * 60 * 60000, full, warnings, true);
            }
        }
    }
    async fetchStat(client, index, mode, baseTime, file, key, ttl, force, warnings, allowMissing = false) {
        const cached = await this.cache.readJson(file, null);
        if (!force && cached && (0, utils_1.isFresh)(index.fetchedAt[key], ttl))
            return;
        try {
            const payload = await client.call("/readdata/detail", { mode, baseTime });
            const cachedPayload = { ...payload, __wrdRequestedMode: mode, __wrdRequestedBaseTime: baseTime > 0 ? baseTime : Math.floor(Date.now() / 1000) };
            await this.cache.writeJson(file, cachedPayload);
            index.fetchedAt[key] = (0, utils_1.nowIso)();
        }
        catch (error) {
            if (isFatalSyncError(error))
                throw error;
            if (!cached) {
                if (!allowMissing)
                    throw error;
                warnings.push({ code: "stats-unavailable", message: `${mode} 阅读统计本次获取失败且暂无旧缓存；已继续发布其他真实数据。`, context: { mode, error: error instanceof Error ? error.message : String(error) } });
                return;
            }
            warnings.push({ code: "stats-stale", message: `${mode} 阅读统计使用旧缓存。` });
        }
    }
    async syncHistory(client, index, warnings) {
        const overall = await this.cache.readJson("stats/overall.json", null);
        const current = (0, utils_1.shanghaiParts)();
        const inferred = inferHistoryStartYear(overall, current.year);
        const startYear = Math.max(2000, Math.min(current.year, inferred?.year ?? current.year));
        if (!inferred) {
            warnings.push({ code: "history-start-year-unresolved", message: "无法从微信读书 overall.registTime / 按年 readTimes / yearReport 自动识别历史起始年；本次只同步当前年。" });
        }
        const years = Array.from({ length: current.year - startYear + 1 }, (_, i) => startYear + i);
        for (const year of years) {
            const file = `stats/years/${year}.json`;
            if (await this.cache.readJson(file, null))
                continue;
            const probe = new Date(Date.UTC(year, 6, 1));
            try {
                await this.fetchStat(client, index, "annually", (0, utils_1.startOfShanghaiPeriodTimestamp)("annually", probe), file, `stats-year-${year}`, Number.POSITIVE_INFINITY, false, warnings);
            }
            catch (error) {
                if (isFatalSyncError(error))
                    throw error;
                warnings.push({ code: "history-year-failed", message: `${year} 历史年统计获取失败。` });
            }
        }
        const months = [];
        for (let year = startYear; year <= current.year; year++)
            for (let month = 1; month <= 12; month++) {
                if (year === current.year && month > current.month)
                    continue;
                const key = `${year}-${String(month).padStart(2, "0")}`;
                months.push({ year, month, key, probe: new Date(Date.UTC(year, month - 1, 15)) });
            }
        await (0, utils_1.mapConcurrent)(months, 1, async (item) => {
            const file = `stats/months/${item.key}.json`;
            if (await this.cache.readJson(file, null))
                return;
            try {
                await this.fetchStat(client, index, "monthly", (0, utils_1.startOfShanghaiPeriodTimestamp)("monthly", item.probe), file, `stats-month-${item.key}`, Number.POSITIVE_INFINITY, false, warnings);
            }
            catch (error) {
                if (isFatalSyncError(error))
                    throw error;
                warnings.push({ code: "history-month-failed", message: `${item.key} 历史月统计获取失败。` });
            }
        });
    }
    currentWeekKey(value) { return (0, utils_1.isoWeekKeyFromDateKey)((0, utils_1.shanghaiDateKey)(value) ?? ""); }
    async collectPreferTimeDiagnostics() {
        const now = new Date();
        const monthKey = (0, utils_1.monthKey)(now);
        const specs = [
            ["weekly", `stats/weeks/${this.currentWeekKey(now)}.json`],
            ["monthly", `stats/months/${monthKey}.json`],
            ["annually", `stats/years/${(0, utils_1.yearKey)(now)}.json`],
            ["overall", "stats/overall.json"],
        ];
        const modes = {};
        for (const [mode, file] of specs) {
            const payload = await this.cache.readJson(file, null);
            modes[mode] = summarizeStatPayload(mode, payload);
        }
        const overall = modes.overall;
        let status = "available";
        if (!overall?.cachePresent) status = "overall-cache-missing";
        else if (!overall.preferTime.present) status = "preferTime-missing";
        else if (overall.preferTime.type !== "array") status = "preferTime-not-array";
        else if (overall.preferTime.buckets !== 24) status = "preferTime-bucket-count-invalid";
        else if (!overall.preferTime.normalizedValid) status = "normalize-failed";
        else if ((overall.preferTime.sumSeconds ?? 0) <= 0) status = "preferTime-all-zero";
        return { generatedAt: (0, utils_1.nowIso)(), monthKey, status, modes };
    }
    async buildAndWrite(mode, index, warnings, upgradeInfo, attemptAt = (0, utils_1.nowIso)(), apiDiagnostics = null) {
        let previous = null;
        try {
            previous = await (0, atomic_writer_1.readPublishedReadingDataValue)(this.host.app);
        }
        catch (error) {
            if (mode !== "full") {
                const wrapped = new Error(`现有 reading-data 无法读取或校验：${error instanceof Error ? error.message : String(error)}。请执行完整同步进行修复。`);
                wrapped.code = "WRD_DATA_REPAIR_REQUIRES_FULL_SYNC";
                wrapped.cause = error;
                throw wrapped;
            }
            console.warn("[Weread Reading Dashboard] canonical reading-data is invalid; full sync will rebuild it", error);
            warnings.push({
                code: "canonical-invalid-repair",
                message: "现有 reading-data 无法读取或校验；本次完整同步将使用新数据重新生成该文件。",
                context: { error: error instanceof Error ? error.message : String(error) },
            });
        }
        const progressFieldDiagnostics = await (0, progress_samples_1.loadProgressFieldDiagnostics)(this.cache);
        const retryQueue = Object.values(index.retryQueue).map((entry) => ({ ...entry, pending: { ...entry.pending } }));
        const shelf = await this.cache.readJson("shelf.json", { books: [] });
        const notebooks = await this.cache.readJson("notebooks.json", { items: [] });
        const notebookMap = new Map((0, utils_1.asArray)(notebooks?.items).map((row) => [(0, utils_1.asString)(row.bookId ?? row.book?.bookId), row]));
        const data = {
            schemaVersion: 1, timeZone: constants_1.TIME_ZONE, scope: { shelfMode: "ebooks", includesAudiobooks: false, includesArticleCollection: false },
            generator: { pluginId: constants_1.PLUGIN_ID, pluginName: constants_1.PLUGIN_NAME, pluginVersion: constants_1.PLUGIN_VERSION, wereadSkillVersion: constants_1.WEREAD_SKILL_VERSION, deviceId: this.host.settings.deviceId, runId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, generatedAt: (0, utils_1.nowIso)() },
            sync: { status: (warnings.length || retryQueue.length) ? "partial" : "success", mode, lastAttemptAt: attemptAt, lastSuccessAt: previous?.sync?.lastSuccessAt ?? null, warnings, upgradeInfo, apiDiagnostics, retryQueue: { books: retryQueue.length, entries: retryQueue }, progressFieldDiagnostics, summary: { books: 0, highlights: 0, thoughts: 0, reviews: 0 } },
            entities: { booksById: {}, highlightsById: {}, thoughtsById: {}, reviewsById: {} }, indexes: { bookIds: [], highlightIdsByBookId: {}, thoughtIdsByBookId: {}, reviewIdsByBookId: {} },
            reading: { coverage: {}, days: {}, weeks: {}, months: {}, years: {}, overall: null }, views: {}
        };
        for (const shelfBook of (0, utils_1.asArray)(shelf?.books)) {
            const id = (0, utils_1.asString)(shelfBook.bookId);
            if (!id)
                continue;
            const [info, progress, notes] = await Promise.all([this.cache.readJson(`books/${(0, utils_1.safeId)(id)}.json`, null), this.cache.readJson(`progress/${(0, utils_1.safeId)(id)}.json`, null), this.cache.readJson(`notes/${(0, utils_1.safeId)(id)}.json`, null)]);
            const local = `阅读系统/_数据/assets/covers/${(0, utils_1.safeId)(id)}.jpg`;
            const localPath = await this.host.app.vault.adapter.exists(local) ? local : null;
            const book = (0, normalizer_1.normalizeBook)(shelfBook, info, progress, notebookMap.get(id), localPath, notes);
            data.entities.booksById[id] = book;
            data.indexes.bookIds.push(id);
            const highlights = (0, utils_1.asArray)(notes?.highlights);
            const thoughts = (0, utils_1.asArray)(notes?.thoughts);
            const reviews = (0, utils_1.asArray)(notes?.reviews);
            data.indexes.highlightIdsByBookId[id] = highlights.map(row => row.id);
            data.indexes.thoughtIdsByBookId[id] = thoughts.map(row => row.id);
            data.indexes.reviewIdsByBookId[id] = reviews.map(row => row.id);
            highlights.forEach(row => data.entities.highlightsById[row.id] = row);
            thoughts.forEach(row => data.entities.thoughtsById[row.id] = row);
            reviews.forEach(row => data.entities.reviewsById[row.id] = row);
        }
        const statFiles = await this.host.app.vault.adapter.list(this.cache.path("stats/months"));
        for (const file of statFiles.files.filter((f) => f.endsWith(".json"))) {
            const payload = JSON.parse(await this.host.app.vault.adapter.read(file));
            const n = (0, normalizer_1.normalizePeriod)("monthly", payload);
            data.reading.months[n.key] = n.fact;
            Object.assign(data.reading.days, n.days);
        }
        const weekFiles = await this.host.app.vault.adapter.list(this.cache.path("stats/weeks"));
        for (const file of weekFiles.files.filter((f) => f.endsWith(".json"))) {
            const payload = JSON.parse(await this.host.app.vault.adapter.read(file));
            const n = (0, normalizer_1.normalizePeriod)("weekly", payload);
            data.reading.weeks[n.key] = n.fact;
            Object.assign(data.reading.days, n.days);
        }
        const yearFiles = await this.host.app.vault.adapter.list(this.cache.path("stats/years"));
        for (const file of yearFiles.files.filter((f) => f.endsWith(".json"))) {
            const payload = JSON.parse(await this.host.app.vault.adapter.read(file));
            const n = (0, normalizer_1.normalizePeriod)("annually", payload);
            data.reading.years[n.key] = n.fact;
            Object.assign(data.reading.days, n.days);
        }
        data.sync.preferTimeDiagnostics = await this.collectPreferTimeDiagnostics();
        const overall = await this.cache.readJson("stats/overall.json", null);
        if (overall) {
            const n = (0, normalizer_1.normalizePeriod)("overall", overall);
            data.reading.overall = { totalSeconds: (0, utils_1.asNumber)(overall.totalReadTime), readDays: (0, utils_1.asNumber)(overall.readDays), registTime: overall.registTime ? (0, utils_1.shanghaiDateKey)(overall.registTime) : null, yearlySeconds: overall.readTimes ?? {}, readStat: n.fact.readStat, preferTimeSeconds: n.fact.preferTimeSeconds ?? null, quality: "exact", coverage: "complete", source: "readdata.overall", asOf: (0, utils_1.nowIso)() };
        }
        this.deriveWeeksFromDays(data);
        (0, aggregators_1.finalizeReading)(data);
        data.views = { ...(0, view_model_builder_1.buildViews)(data), preferences: { bookOpenMode: this.host.settings.bookOpenMode } };
        data.sync.summary = {
            books: Object.keys(data.entities.booksById).length,
            highlights: Object.keys(data.entities.highlightsById).length,
            thoughts: Object.keys(data.entities.thoughtsById).length,
            reviews: Object.keys(data.entities.reviewsById).length
        };
        if (data.sync.summary.books === 0 && !warnings.some((warning) => warning.code === "empty-output")) {
            warnings.push({ code: "empty-output", message: "公开数据文件中没有书籍。请检查书架接口、安装路径和同步诊断。" });
            data.sync.status = "partial";
        }
        if (previous && (0, validator_1.isUnsafePartialRegression)(data, previous)) {
            const before = (0, validator_1.readingDataSummary)(previous);
            const after = (0, validator_1.readingDataSummary)(data);
            const warning = {
                code: "partial-publish-blocked",
                message: `本次 partial sync 出现明显数据缩水，已保留上次完整 reading-data。books ${before.books}→${after.books}, highlights ${before.highlights}→${after.highlights}, thoughts ${before.thoughts}→${after.thoughts}, readDays ${before.readDays}→${after.readDays}`
            };
            data.sync.warnings = [...(data.sync.warnings ?? []), warning];
            try {
                await (0, sync_diagnostics_1.writeSyncDiagnostics)(this.host.app, data);
            }
            catch (diagnosticError) {
                console.error("[Weread Reading Dashboard] write protected-partial diagnostics failed", diagnosticError);
            }
            const error = new Error(warning.message);
            error.code = "WRD_PARTIAL_PUBLISH_BLOCKED";
            throw error;
        }
        await (0, atomic_writer_1.publishReadingData)(this.host.app, data);
        data.sync.publicationHealth = await this.collectPublicationHealth();
        try {
            await this.refreshPublishedUi("sync-published", data);
            data.sync.uiConsumptionHealth = this.host.dataStore?.inspectHealth?.() ?? null;
        }
        catch (error) {
            data.sync.uiConsumptionHealth = this.host.dataStore?.inspectHealth?.() ?? null;
            try {
                await (0, sync_diagnostics_1.writeSyncDiagnostics)(this.host.app, data);
            }
            catch (diagnosticError) {
                console.error("[Weread Reading Dashboard] write UI-consumption failure diagnostics failed", diagnosticError);
            }
            throw error;
        }
        // Commit the success timestamp only after the newly published substantive
        // dataset has passed canonical readback and Native UI consumption checks.
        // A failure before this point leaves the previous successful timestamp intact.
        data.sync.lastSuccessAt = (0, utils_1.nowIso)();
        await (0, atomic_writer_1.publishReadingData)(this.host.app, data);
        data.sync.publicationHealth = await this.collectPublicationHealth();
        try {
            await this.refreshPublishedUi("sync-success-committed", data);
            data.sync.uiConsumptionHealth = this.host.dataStore?.inspectHealth?.() ?? null;
        }
        catch (error) {
            // The substantive dataset was already verified before the metadata-only
            // success commit. Keep success truthful and let the Vault change event retry
            // the final metadata reload rather than rewriting success as a data failure.
            console.warn("[Weread Reading Dashboard] final success metadata UI reload deferred", error);
        }
        // Diagnostics are refreshed after the verified data commit so publish and
        // display health can be compared without advancing success prematurely.
        try {
            await (0, sync_diagnostics_1.writeSyncDiagnostics)(this.host.app, data);
        } catch (error) {
            console.error("[Weread Reading Dashboard] refresh post-UI diagnostics failed", error);
        }
        return data;
    }
    deriveWeeksFromDays(data) {
        const groups = new Map();
        for (const [date, row] of Object.entries(data.reading.days)) {
            const key = this.weekKeyFromDate(date);
            if (!key)
                continue;
            const g = groups.get(key) ?? { seconds: 0, days: 0, daily: {} };
            const seconds = Math.max(0, Number(row.seconds) || 0);
            g.seconds += seconds;
            g.daily[date] = seconds;
            // WeRead readDays currently counts a day after at least one minute.
            if (seconds >= 60)
                g.days++;
            groups.set(key, g);
        }
        for (const [key, g] of groups) {
            const bounds = this.weekBoundsFromKey(key);
            const existing = data.reading.weeks[key];
            const preserveExact = existing && (existing.quality === "exact" || String(existing.source ?? "").startsWith("readdata.weekly"));
            if (preserveExact) {
                if (!existing.startDate && bounds.startDate)
                    existing.startDate = bounds.startDate;
                if (!existing.endDate && bounds.endDate)
                    existing.endDate = bounds.endDate;
                continue;
            }
            // Derived weeks are cacheable views of the latest daily facts, not
            // immutable records. Rebuild them every publication so corrected or
            // newly arrived monthly daily data cannot leave stale weekly totals.
            data.reading.weeks[key] = { periodType: "week", startDate: bounds.startDate, endDate: bounds.endDate, totalSeconds: g.seconds, readDays: g.days, dailySeconds: g.daily, coverage: "complete", quality: "derived", source: "monthly.daily", asOf: (0, utils_1.nowIso)() };
        }
    }
    weekBoundsFromKey(key) {
        const match = String(key ?? "").match(/^(\d{4})-W(\d{1,2})$/i);
        if (!match)
            return { startDate: null, endDate: null };
        const year = Number(match[1]);
        const week = Number(match[2]);
        const jan4 = new Date(Date.UTC(year, 0, 4));
        const jan4Day = jan4.getUTCDay() || 7;
        const monday = new Date(Date.UTC(year, 0, 4 - (jan4Day - 1) + (week - 1) * 7));
        const sunday = new Date(monday.getTime() + 6 * 86400000);
        const dateKey = (value) => `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
        return { startDate: dateKey(monday), endDate: dateKey(sunday) };
    }
    weekKeyFromDate(date) { return (0, utils_1.isoWeekKeyFromDateKey)(date); }
    async markFailure(error, attemptAt, warnings, apiDiagnostics = null, index = null) {
        let existing = null;
        try {
            existing = await (0, atomic_writer_1.readPublishedReadingDataValue)(this.host.app);
        }
        catch (readError) {
            console.warn("[Weread Reading Dashboard] failed to annotate sync failure because canonical reading-data is unreadable", readError);
            return;
        }
        if (!existing)
            return;
        const progressFieldDiagnostics = await (0, progress_samples_1.loadProgressFieldDiagnostics)(this.cache);
        const entries = index ? Object.values(index.retryQueue).map((entry) => ({ ...entry, pending: { ...entry.pending } })) : (existing.sync?.retryQueue?.entries ?? []);
        existing.sync = { ...existing.sync, status: "failed", lastAttemptAt: attemptAt, warnings: [...warnings, { code: "sync-failed", message: error instanceof Error ? error.message : String(error) }], upgradeInfo: error?.upgradeInfo ?? existing.sync?.upgradeInfo ?? null, apiDiagnostics: apiDiagnostics ?? existing.sync?.apiDiagnostics ?? null, retryQueue: { books: entries.length, entries }, progressFieldDiagnostics };
        existing.generator.generatedAt = (0, utils_1.nowIso)();
        await (0, atomic_writer_1.publishReadingData)(this.host.app, existing);
        existing.sync.publicationHealth = await this.collectPublicationHealth();
        await this.refreshPublishedUi("sync-failed-preserve", existing);
        existing.sync.uiConsumptionHealth = this.host.dataStore?.inspectHealth?.() ?? null;
        try {
            await (0, sync_diagnostics_1.writeSyncDiagnostics)(this.host.app, existing);
        }
        catch (diagnosticError) {
            console.error("[Weread Reading Dashboard] write failure diagnostics failed", diagnosticError);
        }
    }
}
exports.SyncManager = SyncManager;
function summarizeStatPayload(mode, payload) {
    const cachePresent = Boolean(payload && typeof payload === "object");
    const responseFields = cachePresent ? Object.keys(payload).filter((key) => !key.startsWith("__wrd")).sort() : [];
    const readTimes = cachePresent && payload.readTimes && typeof payload.readTimes === "object" && !Array.isArray(payload.readTimes) ? payload.readTimes : null;
    const preferPresent = Boolean(cachePresent && Object.prototype.hasOwnProperty.call(payload, "preferTime"));
    const preferRaw = preferPresent ? payload.preferTime : undefined;
    const preferArray = Array.isArray(preferRaw) ? preferRaw.map((value) => Math.max(0, Number(value) || 0)) : null;
    const normalized = preferArray && preferArray.length === 24 ? [...preferArray.slice(18), ...preferArray.slice(0, 18)] : null;
    const wordPresent = Boolean(cachePresent && Object.prototype.hasOwnProperty.call(payload, "preferTimeWord"));
    return {
        mode,
        cachePresent,
        responseFields,
        baseTime: cachePresent ? payload.baseTime ?? null : null,
        requestedMode: cachePresent ? payload.__wrdRequestedMode ?? mode : mode,
        requestedBaseTime: cachePresent ? payload.__wrdRequestedBaseTime ?? null : null,
        totalReadTime: cachePresent && Number.isFinite(Number(payload.totalReadTime)) ? Number(payload.totalReadTime) : null,
        readDays: cachePresent && Number.isFinite(Number(payload.readDays)) ? Number(payload.readDays) : null,
        readTimesType: readTimes ? "object" : cachePresent && Object.prototype.hasOwnProperty.call(payload, "readTimes") ? Array.isArray(payload.readTimes) ? "array" : typeof payload.readTimes : "missing",
        readTimesBuckets: readTimes ? Object.keys(readTimes).length : null,
        preferTime: {
            present: preferPresent,
            type: Array.isArray(preferRaw) ? "array" : preferRaw === null ? "null" : typeof preferRaw,
            buckets: preferArray ? preferArray.length : null,
            nonZeroBuckets: preferArray ? preferArray.filter((value) => value > 0).length : null,
            sumSeconds: preferArray ? preferArray.reduce((sum, value) => sum + value, 0) : null,
            normalizedValid: Boolean(normalized && normalized.length === 24),
            raw: preferArray,
            normalized00To23: normalized,
        },
        preferTimeWord: {
            present: wordPresent,
            value: wordPresent && payload.preferTimeWord !== null && payload.preferTimeWord !== undefined ? String(payload.preferTimeWord) : null,
        },
        styleType: cachePresent ? payload.styleType ?? null : null,
    };
}
function mergeById(oldRows, newRows) {
    const map = new Map();
    for (const row of oldRows)
        if ((0, utils_1.asString)(row?.id))
            map.set((0, utils_1.asString)(row.id), row);
    for (const row of newRows)
        if ((0, utils_1.asString)(row?.id))
            map.set((0, utils_1.asString)(row.id), row);
    return [...map.values()];
}
function asApiError(error) {
    return error instanceof errors_1.WereadApiError
        ? error
        : new errors_1.WereadApiError(error instanceof Error ? error.message : String(error), null, null, true, 1);
}
function randomBetween(min, max) { return min + Math.floor(Math.random() * (Math.max(min, max) - min + 1)); }

},
"ui/settings-tab.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WereadSettingTab = void 0;
const obsidian_1 = require("obsidian");
class WereadSettingTab extends obsidian_1.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.classList?.add("wrd-settings-page");
        containerEl.createEl?.("h2", { text: "Weread Reading Dashboard" });
        this.renderApiKey(containerEl);
        this.renderCommonSettings(containerEl);
        this.renderAdvancedSettings(containerEl);
    }
    renderApiKey(containerEl) {
        const masked = this.plugin.getMaskedApiKey();
        let pendingValue = "";
        const setting = new obsidian_1.Setting(containerEl)
            .setName("微信读书API Key")
            .setDesc(masked ? `已安全保存：${masked}。粘贴新 Key 并验证成功后才会替换当前密钥。` : "请输入以 wrk- 开头的微信读书 API Key。Key 仅保存在 Obsidian 安全凭据中。");
        setting.settingEl?.classList?.add("wrd-setting-stack", "wrd-api-key-setting");
        if (setting.nameEl) {
            setting.nameEl.appendChild(document.createTextNode("\u00A0\u00A0"));
            const getLink = document.createElement("a");
            getLink.href = "https://weread.qq.com/r/weread-skills";
            getLink.target = "_blank";
            getLink.rel = "noopener noreferrer";
            getLink.textContent = "获取";
            setting.nameEl.appendChild(getLink);
        }
        const feedback = document.createElement("div");
        feedback.setAttribute("role", "alert");
        feedback.style.marginTop = "8px";
        feedback.style.color = "#a33b32";
        feedback.style.fontSize = "12px";
        feedback.style.lineHeight = "1.45";
        feedback.hidden = true;
        const setError = (message) => {
            feedback.textContent = String(message || "验证失败，请重试。");
            feedback.hidden = false;
        };
        const clearError = () => {
            feedback.textContent = "";
            feedback.hidden = true;
        };
        setting.addText((text) => {
            text
                .setPlaceholder(masked ? "粘贴新 Key 可替换当前密钥" : "wrk-xxxxxxxxxxxxxxxx")
                .setValue("")
                .onChange((value) => {
                pendingValue = value;
                clearError();
            });
            if (text.inputEl) {
                text.inputEl.type = "password";
                text.inputEl.autocomplete = "off";
                text.inputEl.spellcheck = false;
                text.inputEl.classList?.add("wrd-api-key-input");
            }
        });
        setting.addButton((button) => button
            .setButtonText("验证并保存")
            .setCta?.()
            .onClick(async () => {
            button.setDisabled(true);
            clearError();
            try {
                await this.plugin.testCandidateApiKey(pendingValue);
                await this.plugin.saveApiKey(pendingValue);
                pendingValue = "";
                this.display();
            }
            catch (error) {
                setError(`验证失败，未覆盖已保存的 Key：${error instanceof Error ? error.message : String(error)}`);
            }
            finally {
                button.setDisabled(false);
            }
        }));
        setting.addButton((button) => button
            .setButtonText("清除")
            .onClick(async () => {
            button.setDisabled(true);
            clearError();
            try {
                await this.plugin.clearApiKey();
                pendingValue = "";
                this.display();
            }
            catch (error) {
                setError(`清除失败：${error instanceof Error ? error.message : String(error)}`);
            }
            finally {
                button.setDisabled(false);
            }
        }));
        setting.settingEl?.appendChild(feedback);
    }
    renderCommonSettings(containerEl) {
        const openSetting = new obsidian_1.Setting(containerEl)
            .setName("模版内开启微信读书的方式")
            .addDropdown((dropdown) => dropdown
            .addOption("browser", "浏览器打开（默认）")
            .addOption("webviewer", "Obsidian 内打开（需开启核心插件-网页浏览器）")
            .setValue(this.plugin.settings.bookOpenMode)
            .onChange(async (value) => {
            this.plugin.settings.bookOpenMode = value;
            await this.plugin.saveSettings();
        }));
        openSetting.settingEl?.classList?.add("wrd-setting-stack", "wrd-open-mode-setting");
    }
    renderAdvancedSettings(containerEl) {
        const details = containerEl.createEl("details", { cls: "wrd-advanced-settings" });
        details.createEl("summary", { text: "高级设置" });
        const versionSetting = new obsidian_1.Setting(details)
            .setName("运行信息");
        versionSetting.controlEl?.createSpan?.({ text: `插件版本：${this.plugin.manifest.version}`, cls: "wrd-runtime-version" });
        const fullSync = new obsidian_1.Setting(details)
            .setName("重新完整同步")
            .setDesc("仅用于首次数据重建或故障修复；看板右上角刷新使用增量同步。")
            .addButton((button) => button
            .setButtonText("重新同步全部数据")
            .onClick(async () => {
            button.setDisabled(true);
            fullSyncError.textContent = "";
            fullSyncError.hidden = true;
            try {
                await this.plugin.syncManager.fullSync();
            }
            catch (error) {
                fullSyncError.textContent = `完整同步失败：${error instanceof Error ? error.message : String(error)}`;
                fullSyncError.hidden = false;
            }
            finally {
                button.setDisabled(false);
            }
        }));
        fullSync.settingEl?.classList?.add("wrd-maintenance-setting");
        const fullSyncError = document.createElement("div");
        fullSyncError.setAttribute("role", "alert");
        fullSyncError.style.marginTop = "8px";
        fullSyncError.style.color = "#a33b32";
        fullSyncError.style.fontSize = "12px";
        fullSyncError.style.lineHeight = "1.45";
        fullSyncError.hidden = true;
        fullSync.settingEl?.appendChild(fullSyncError);
        const diagnostics = new obsidian_1.Setting(details)
            .setName("故障排查")
            .setDesc("刷新周/月/年/总计阅读统计并更新诊断文件，不扫描书架、不请求单书接口；需要排查时可先刷新诊断，再打开诊断文件。")
            .addButton((button) => button
            .setButtonText("刷新诊断")
            .onClick(async () => {
            button.setDisabled(true);
            diagnosticsError.textContent = "";
            diagnosticsError.hidden = true;
            try {
                await this.plugin.syncManager.refreshPreferTimeDiagnostics();
            }
            catch (error) {
                diagnosticsError.textContent = `诊断刷新失败：${error instanceof Error ? error.message : String(error)}`;
                diagnosticsError.hidden = false;
            }
            finally {
                button.setDisabled(false);
            }
        }))
            .addButton((button) => button
            .setButtonText("查看诊断")
            .onClick(async () => {
            button.setDisabled(true);
            diagnosticsError.textContent = "";
            diagnosticsError.hidden = true;
            try {
                await this.plugin.syncManager.openDiagnostics();
            }
            catch (error) {
                diagnosticsError.textContent = `打开诊断失败：${error instanceof Error ? error.message : String(error)}`;
                diagnosticsError.hidden = false;
            }
            finally {
                button.setDisabled(false);
            }
        }));
        diagnostics.settingEl?.classList?.add("wrd-maintenance-setting");
        const diagnosticsError = document.createElement("div");
        diagnosticsError.setAttribute("role", "alert");
        diagnosticsError.style.marginTop = "8px";
        diagnosticsError.style.color = "#a33b32";
        diagnosticsError.style.fontSize = "12px";
        diagnosticsError.style.lineHeight = "1.45";
        diagnosticsError.hidden = true;
        diagnostics.settingEl?.appendChild(diagnosticsError);
    }
}
exports.WereadSettingTab = WereadSettingTab;

},
"utils.js": function(module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nowIso = nowIso;
exports.asNumber = asNumber;
exports.asString = asString;
exports.asArray = asArray;
exports.unixToIso = unixToIso;
exports.shanghaiDateKey = shanghaiDateKey;
exports.shanghaiParts = shanghaiParts;
exports.monthKey = monthKey;
exports.yearKey = yearKey;
exports.startOfShanghaiPeriodTimestamp = startOfShanghaiPeriodTimestamp;
exports.isoWeekKeyFromDateKey = isoWeekKeyFromDateKey;
exports.periodKeyFromBase = periodKeyFromBase;
exports.stableStringify = stableStringify;
exports.fnv1a = fnv1a;
exports.ensureDir = ensureDir;
exports.isFresh = isFresh;
exports.chunk = chunk;
exports.mapConcurrent = mapConcurrent;
exports.safeId = safeId;
exports.sleep = sleep;
exports.asVaultFile = asVaultFile;
const obsidian_1 = require("obsidian");
const constants_1 = __wrd_require("constants.js");
function nowIso() { return new Date().toISOString(); }
function asNumber(value, fallback = null) {
    if (value === null || value === undefined || (typeof value === "string" && value.trim() === ""))
        return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}
function asString(value, fallback = "") {
    return value === null || value === undefined ? fallback : String(value);
}
function asArray(value) { return Array.isArray(value) ? value : []; }
function unixToIso(value) {
    const n = asNumber(value);
    if (n === null || n <= 0)
        return null;
    const ms = n < 10000000000 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function shanghaiDateKey(value) {
    const n = asNumber(value);
    const date = n !== null ? new Date(n < 10000000000 ? n * 1000 : n) : value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime()))
        return null;
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: constants_1.TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${map.year}-${map.month}-${map.day}`;
}
function shanghaiParts(value = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: constants_1.TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(value);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return { year: Number(map.year), month: Number(map.month), day: Number(map.day), hour: Number(map.hour) };
}
function monthKey(value = new Date()) { const p = shanghaiParts(value); return `${p.year}-${String(p.month).padStart(2, "0")}`; }
function yearKey(value = new Date()) { return String(shanghaiParts(value).year); }
function startOfShanghaiPeriodTimestamp(mode, value = new Date()) {
    const key = shanghaiDateKey(value);
    let [y, m, d] = key.split("-").map(Number);
    if (mode === "monthly")
        d = 1;
    if (mode === "annually") {
        m = 1;
        d = 1;
    }
    if (mode === "weekly") {
        const utcProbe = new Date(Date.UTC(y, m - 1, d));
        const dow = utcProbe.getUTCDay() || 7;
        utcProbe.setUTCDate(utcProbe.getUTCDate() - (dow - 1));
        y = utcProbe.getUTCFullYear();
        m = utcProbe.getUTCMonth() + 1;
        d = utcProbe.getUTCDate();
    }
    return Math.floor(Date.UTC(y, m - 1, d, -8, 0, 0) / 1000);
}
function isoWeekKeyFromDateKey(dateKey) {
    const match = String(dateKey ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match)
        return "";
    const probe = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    const day = probe.getUTCDay() || 7;
    probe.setUTCDate(probe.getUTCDate() + 4 - day);
    const isoYear = probe.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const week = Math.ceil((((probe.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${isoYear}-W${String(week).padStart(2, "0")}`;
}
function periodKeyFromBase(mode, baseTime) {
    if (mode === "overall")
        return "overall";
    const dateKey = shanghaiDateKey(baseTime) ?? shanghaiDateKey(new Date());
    if (mode === "monthly")
        return dateKey.slice(0, 7);
    if (mode === "annually")
        return dateKey.slice(0, 4);
    return isoWeekKeyFromDateKey(dateKey);
}
function stableStringify(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(stableStringify).join(",")}]`;
    const obj = value;
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}
function fnv1a(value) {
    const text = stableStringify(value);
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}
async function ensureDir(adapter, path) {
    const parts = (0, obsidian_1.normalizePath)(path).split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        if (!(await adapter.exists(current)))
            await adapter.mkdir(current);
    }
}
function isFresh(iso, ttlMs) {
    if (!iso)
        return false;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && Date.now() - t < ttlMs;
}
function chunk(items, size) { const out = []; for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size)); return out; }
async function mapConcurrent(items, limit, worker) {
    const out = new Array(items.length);
    let cursor = 0;
    async function run() { while (true) {
        const i = cursor++;
        if (i >= items.length)
            return;
        out[i] = await worker(items[i], i);
    } }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, run));
    return out;
}
function safeId(value) { return asString(value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 160); }
function sleep(ms) { return new Promise((resolve) => globalThis.setTimeout(resolve, ms)); }
function asVaultFile(app, path) {
    if (typeof app?.vault?.getAbstractFileByPath !== "function")
        return null;
    const file = app.vault.getAbstractFileByPath(path);
    return file && typeof file.path === "string" ? file : null;
}

}
};
const __wrd_cache = Object.create(null);
function __wrd_require(id) {
  if (__wrd_cache[id]) return __wrd_cache[id].exports;
  const factory = __wrd_modules[id];
  if (!factory) throw new Error('Weread Reading Dashboard module not found: ' + id);
  const module = { exports: {} };
  __wrd_cache[id] = module;
  factory(module, module.exports);
  return module.exports;
}
module.exports = __wrd_require('main.js');

  })(module, exports, require);
  return module.exports;
})() /* sync-runtime */;
const __WRD_UI_EXPORTS = (() => {
  const module = { exports: {} };
  const exports = module.exports;
  ((module, exports, require) => {
"use strict";

const { ItemView, MarkdownView, normalizePath } = require("obsidian");

const HOME_VIEW_TYPE = "weread-dashboard-v2-home";
const REVIEW_VIEW_TYPE = "weread-dashboard-v2-review";
const SHELF_VIEW_TYPE = "weread-dashboard-v2-shelf";
const BOOK_DETAIL_VIEW_TYPE = "weread-dashboard-v2-book-detail";
const KNOWLEDGE_VIEW_TYPE = "weread-dashboard-v2-knowledge";
const ROOT_FOLDER = "阅读系统";
const HOME_FILE = `${ROOT_FOLDER}/00-阅读看板.md`;
const REVIEW_CENTER_FILE = `${ROOT_FOLDER}/功能页面/回顾中心.md`;
const SHELF_FILE = `${ROOT_FOLDER}/功能页面/完整书架.md`;
const BOOK_DETAIL_FILE = `${ROOT_FOLDER}/功能页面/书籍详情.md`;
const KNOWLEDGE_FILE = `${ROOT_FOLDER}/功能页面/知识中心.md`;
const DEFAULT_DATA_FILE = `${ROOT_FOLDER}/_数据/reading-data.json`;
const DEFAULT_HOME_STYLE = `${ROOT_FOLDER}/_系统/首页.css`;
const DEFAULT_FUNCTION_STYLE = `${ROOT_FOLDER}/_系统/功能页面.css`;
const CONFIG_FILE = `${ROOT_FOLDER}/配置/阅读看板配置.md`;
const REVIEW_FOLDER = `${ROOT_FOLDER}/_用户数据/阅读回顾`;
const BOOK_REVIEW_FOLDER = `${ROOT_FOLDER}/_用户数据/书评`;
const DRAFT_STORAGE_KEY = "weread-dashboard-v2-review-drafts-v1";

function canonicalTextFingerprint(text) {
  const source = String(text ?? "");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${source.length}:${(hash >>> 0).toString(16)}`;
}

function el(tag, className = "", text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null && text !== undefined) node.textContent = String(text);
  return node;
}

function append(parent, ...children) {
  for (const child of children.flat()) {
    if (child !== null && child !== undefined) parent.appendChild(child);
  }
  return parent;
}

function setInlineError(container, message) {
  if (!container) return null;
  let node = container.querySelector?.('[data-wrd-inline-error="true"]') ?? null;
  if (!node) {
    node = document.createElement("div");
    node.dataset.wrdInlineError = "true";
    node.setAttribute("role", "alert");
    node.style.marginTop = "8px";
    node.style.color = "#a33b32";
    node.style.fontSize = "12px";
    node.style.lineHeight = "1.45";
    node.style.whiteSpace = "normal";
    node.style.overflowWrap = "anywhere";
    container.appendChild(node);
  }
  node.textContent = String(message || "操作失败，请重试。");
  node.hidden = false;
  return node;
}

function clearInlineError(container) {
  const node = container?.querySelector?.('[data-wrd-inline-error="true"]');
  if (node) {
    node.textContent = "";
    node.hidden = true;
  }
}

const ICON_PATHS = {
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5A2.5 2.5 0 0 1 20 21.5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bulb: '<path d="M9 18h6M10 22h4"/><path d="M8.5 15.5C7 14.2 6 12.4 6 10.3A6 6 0 0 1 18 10c0 2.2-1 4.1-2.6 5.5-.8.7-1.2 1.5-1.2 2.5H9.8c0-1-.4-1.8-1.3-2.5Z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  pen: '<path d="m4 20 4.5-1 10-10a2 2 0 0 0-3-3l-10 10z"/><path d="m14 7 3 3"/>',
  sync: '<path d="M20 7h-5V2"/><path d="M4 17h5v5"/><path d="M19 7a8 8 0 0 0-13-2M5 17a8 8 0 0 0 13 2"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/>',
  lamp: '<path d="M9 18h6M10 22h4"/><path d="M8.5 15.5C7 14.2 6 12.4 6 10.3A6 6 0 0 1 18 10c0 2.2-1 4.1-2.6 5.5-.8.7-1.2 1.5-1.2 2.5H9.8c0-1-.4-1.8-1.3-2.5Z"/>',
  quote: '<path d="M7.5 7.5h-3v5h4v4h-6v-5c0-3.2 1.6-5.3 5-6.5zM17.5 7.5h-3v5h4v4h-6v-5c0-3.2 1.6-5.3 5-6.5z"/>',
  back: '<path d="m15 18-6-6 6-6"/><path d="M9 12h10"/>',
  spark: '<path d="m12 3 1.4 4.2L18 9l-4.6 1.8L12 15l-1.4-4.2L6 9l4.6-1.8L12 3Z"/><path d="m19 15 .7 2.1L22 18l-2.3.9L19 21l-.7-2.1L16 18l2.3-.9L19 15Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  note: '<path d="M5 3h14v18H5z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
};

function icon(name, className = "") {
  const span = el("span", `wrdn-icon ${className}`.trim());
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] ?? ""}</svg>`;
  return span;
}

function pageIcon(name, className = "") {
  const span = el("span", `wrdn-p-icon ${className}`.trim());
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] ?? ""}</svg>`;
  return span;
}

function dateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value?.toJSDate) return value.toJSDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function recordCreatedDate(record) {
  return dateValue(record?.createdAt ?? record?.created);
}

function stringArray(value) {
  if (value === null || value === undefined || value === "") return [];
  const source = typeof value === "string" ? value.split(/\n+/) : Array.isArray(value) ? value : [value];
  return source.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function configSignature(config) {
  const source = config || Object.create(null);
  return JSON.stringify({
    daily_goal_minutes: Number(source.daily_goal_minutes ?? 30),
    source_book_limit: Number(source.source_book_limit ?? 4),
    reading_field_limit: Number(source.reading_field_limit ?? 6),
  });
}

function reviewSignature(review) {
  const source = review || Object.create(null);
  return JSON.stringify({
    personal_gain: String(source.personal_gain ?? ""),
    next_week_focus: stringArray(source.next_week_focus),
    next_month_focus: stringArray(source.next_month_focus),
    next_year_focus: stringArray(source.next_year_focus),
  });
}

function todayKeyShanghai(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isoWeekKey(date = new Date()) {
  const localKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const [year, month, day] = localKey.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  const weekday = probe.getUTCDay() || 7;
  probe.setUTCDate(probe.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(probe.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((probe - yearStart) / 86400000) + 1) / 7);
  return `${probe.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function currentReviewPeriodContext(date = new Date()) {
  const todayKey = todayKeyShanghai(date);
  return {
    todayKey,
    weekKey: isoWeekKey(date),
    monthKey: todayKey.slice(0, 7),
    year: Number(todayKey.slice(0, 4)),
  };
}

function emptyReadingData() {
  return {
    schemaVersion: 1,
    sync: { status: "idle", lastSuccessAt: null, warnings: [] },
    entities: { booksById: {}, highlightsById: {}, thoughtsById: {}, reviewsById: {} },
    indexes: { bookIds: [], highlightIdsByBookId: {}, thoughtIdsByBookId: {}, reviewIdsByBookId: {} },
    reading: { days: {}, weeks: {}, months: {}, years: {}, overall: null },
    views: { home: { todayBookId: null }, preferences: { bookOpenMode: "browser" } },
  };
}



class ReadingDataStore {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.dataPath = normalizePath(DEFAULT_DATA_FILE);
    this.snapshot = null;
    this.revision = 0;
    this.listeners = new Set();
    this.reloadTimer = null;
    this.loading = null;
    this.lastError = null;
    this.presentationError = null;
    this.lastLoadedAt = null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  scheduleReload(reason, delay = 180) {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      void this.reload(reason).catch((error) => {
        console.error("[Weread UI V2] background data reload failed", error);
      });
    }, Math.max(0, Number(delay) || 0));
  }

  async getSnapshot() {
    if (this.snapshot) return this.snapshot;
    return this.reload("initial");
  }

  async reload(reason = "unknown", options = {}) {
    const force = options === true || Boolean(options?.force);
    if (force && this.loading) {
      try { await this.loading; } catch {}
    }
    if (this.loading) return this.loading;
    this.loading = this.#readCanonical()
      .then((next) => {
        this.lastError = null;
        this.lastLoadedAt = new Date().toISOString();
        if (!force && this.snapshot && this.snapshot.fingerprint === next.fingerprint && this.snapshot.state === next.state && this.snapshot.sourceStatus === next.sourceStatus) {
          return this.snapshot;
        }
        this.snapshot = Object.freeze({ ...next, revision: ++this.revision, reason });
        for (const listener of [...this.listeners]) {
          try { listener(this.snapshot); }
          catch (error) { console.error("[Weread UI V2] data subscriber failed", error); }
        }
        return this.snapshot;
      })
      .catch((error) => {
        this.lastError = error?.message || String(error);
        throw error;
      })
      .finally(() => { this.loading = null; });
    return this.loading;
  }

  async #readCanonical() {
    const candidate = await this.plugin.readPublishedReadingData();
    if (!candidate) {
      this.presentationError = null;
      return {
        data: emptyReadingData(),
        fingerprint: "missing:empty",
        state: "missing",
        sourceStatus: "数据来源：尚未生成 reading-data.json",
      };
    }
    this.presentationError = null;
    return {
      data: candidate.data,
      fingerprint: `canonical:${canonicalTextFingerprint(candidate.raw)}`,
      state: "ready",
      sourceStatus: "",
    };
  }

  inspectHealth() {
    const data = this.snapshot?.data ?? null;
    return {
      dataPath: this.dataPath,
      snapshotState: this.snapshot?.state ?? "none",
      revision: this.snapshot?.revision ?? 0,
      reason: this.snapshot?.reason ?? null,
      sourceStatus: this.snapshot?.sourceStatus ?? null,
      lastLoadedAt: this.lastLoadedAt,
      books: data ? Object.keys(data?.entities?.booksById ?? {}).length : null,
      highlights: data ? Object.keys(data?.entities?.highlightsById ?? {}).length : null,
      thoughts: data ? Object.keys(data?.entities?.thoughtsById ?? {}).length : null,
      lastError: this.lastError,
      presentationError: this.presentationError,
    };
  }

  dispose() {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = null;
    this.listeners.clear();
  }
}

class ContentChangeStore {
  constructor() {
    this.listeners = new Set();
    this.timer = null;
    this.pendingPaths = new Set();
    this.suppressedUntil = new Map();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  suppress(path, duration = 1600) {
    const normalized = normalizePath(String(path || ""));
    if (!normalized) return;
    this.suppressedUntil.set(normalized, Date.now() + Math.max(250, Number(duration) || 0));
  }

  async runOwnWrite(path, task) {
    this.suppress(path, 2400);
    try { return await task(); }
    finally { this.suppress(path, 1600); }
  }

  notify(path, delay = 100) {
    const normalized = normalizePath(String(path || ""));
    if (!normalized) return;
    const suppressedUntil = Number(this.suppressedUntil.get(normalized) || 0);
    if (suppressedUntil > Date.now()) return;
    if (suppressedUntil) this.suppressedUntil.delete(normalized);
    this.pendingPaths.add(normalized);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), Math.max(0, Number(delay) || 0));
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.pendingPaths.size) return;
    const paths = new Set(this.pendingPaths);
    this.pendingPaths.clear();
    for (const listener of [...this.listeners]) {
      try { listener(paths); }
      catch (error) { console.error("[Weread UI V2] content subscriber failed", error); }
    }
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pendingPaths.clear();
    this.suppressedUntil.clear();
    this.listeners.clear();
  }
}

class SessionStore {
  constructor() {
    this.pages = new Map();
  }

  page(key) {
    if (!this.pages.has(key)) this.pages.set(key, Object.create(null));
    return this.pages.get(key);
  }
}

class DraftStore {
  constructor(app) {
    this.app = app;
    this.records = new Map();
    this.saveTimer = null;
    const stored = app.loadLocalStorage?.(DRAFT_STORAGE_KEY);
    if (stored && typeof stored === "object") {
      for (const [key, value] of Object.entries(stored)) {
        if (!value || typeof value !== "object") continue;
        this.records.set(key, { value: String(value.value ?? ""), editing: Boolean(value.editing), updatedAt: Number(value.updatedAt || 0) });
      }
    }
  }

  get(key) { return this.records.get(String(key || "")) ?? null; }
  isEditing(key) { return Boolean(this.get(key)?.editing); }
  hasActive(prefix = "") {
    for (const [key, record] of this.records) if (record?.editing && (!prefix || key.startsWith(prefix))) return true;
    return false;
  }

  begin(key, value = "") { this.set(key, value, true); }
  update(key, value) { this.set(key, value, true); }
  end(key) {
    const record = this.get(key);
    if (!record) return;
    this.records.set(key, { ...record, editing: false, updatedAt: Date.now() });
    this.schedulePersist();
  }
  clear(key) { this.records.delete(String(key || "")); this.schedulePersist(); }

  reconcileActive(prefixes) {
    const allowed = Array.isArray(prefixes) ? prefixes.filter(Boolean) : [];
    let changed = false;
    for (const [key, record] of this.records) {
      if (!record?.editing) continue;
      if (allowed.some((prefix) => key.startsWith(prefix))) continue;
      this.records.set(key, { ...record, editing: false, updatedAt: Date.now() });
      changed = true;
    }
    if (changed) this.schedulePersist();
  }

  set(key, value, editing) {
    const normalized = String(key || "");
    if (!normalized) return;
    this.records.set(normalized, { value: String(value ?? ""), editing: Boolean(editing), updatedAt: Date.now() });
    this.schedulePersist();
  }

  schedulePersist() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persist(), 120);
  }

  persist() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const data = Object.fromEntries(this.records);
    this.app.saveLocalStorage?.(DRAFT_STORAGE_KEY, Object.keys(data).length ? data : null);
  }

  dispose() { this.persist(); }
}

class SyncController {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.state = Object.freeze({ phase: "idle" });
    this.listeners = new Set();
    this.idleTimer = null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  accept(state) {
    if (!state || typeof state !== "object") return;
    this.#set({ ...state, phase: String(state.phase || "idle") });
    if (this.state.phase === "completed") {
      if (this.idleTimer) clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => this.#set({ phase: "idle" }), 1600);
    } else if (this.state.phase === "failed" && this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }


  start(mode = "quick") {
    if (["starting", "progress"].includes(this.state.phase)) return;
    const syncMode = mode === "full" ? "full" : "quick";
    this.#set({ phase: "starting", mode: syncMode });
    const manager = this.plugin?.syncManager;
    if (!manager) {
      this.#set({ phase: "failed", message: "同步运行时尚未就绪" });
      return;
    }
    const task = syncMode === "full" ? manager.fullSync() : manager.quickSync();
    void Promise.resolve(task).catch((error) => {
      // SyncManager emits the authoritative failed state. This catch only covers
      // unexpected handoff failures without creating a second sync path.
      if (this.state.phase !== "failed") this.#set({ phase: "failed", message: error?.message || String(error) });
    });
  }

  #set(next) {
    this.state = Object.freeze({ ...next });
    for (const listener of [...this.listeners]) {
      try { listener(this.state); }
      catch (error) { console.error("[Weread UI V2] sync subscriber failed", error); }
    }
  }

  dispose() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.listeners.clear();
  }
}

class VaultTextCache {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.cache = new Map();
  }

  invalidate(path) {
    this.cache.delete(normalizePath(String(path || "")));
  }

  async read(path) {
    const normalized = normalizePath(String(path || ""));
    if (this.cache.has(normalized)) return this.cache.get(normalized);

    let file = this.app.vault.getAbstractFileByPath(normalized);
    if (!file && typeof this.plugin.ensureProjectScaffold === "function") {
      // Managed runtime assets are authoritative. If a user opens a Native page while
      // the Vault is still finishing startup, repair the scaffold before rendering.
      // This is self-healing of the same canonical template path, not a second asset chain.
      try { await this.plugin.ensureProjectScaffold(); }
      catch (error) { console.warn(`[Weread UI V2] managed asset repair failed: ${normalized}`, error); }
      file = this.app.vault.getAbstractFileByPath(normalized);
    }

    if (file) {
      const text = await this.app.vault.cachedRead(file);
      this.cache.set(normalized, text);
      return text;
    }

    const embedded = typeof this.plugin.getEmbeddedTemplateContent === "function"
      ? this.plugin.getEmbeddedTemplateContent(normalized)
      : null;
    if (typeof embedded === "string") {
      // Last-resort render safety: never white-screen a Native page solely because a managed
      // CSS file has not yet appeared in the Vault. The next scaffold pass still recreates it.
      this.cache.set(normalized, embedded);
      return embedded;
    }

    throw new Error(`未找到文件：${normalized}`);
  }
}

class NavigationBridge {
  constructor(app, sessionStore, rootFolder = ROOT_FOLDER) {
    this.app = app;
    this.sessionStore = sessionStore;
    this.rootFolder = rootFolder;
  }

  async openBook(book, tab = "highlights", leaf = null) {
    const id = String(book?.id ?? "").trim();
    if (!id) return false;
    const targetLeaf = leaf || this.app.workspace.activeLeaf || null;
    if (!targetLeaf) return false;
    const file = this.app.vault.getAbstractFileByPath(normalizePath(BOOK_DETAIL_FILE));
    if (!file) { console.error(`[Weread UI V2] 未找到页面：${BOOK_DETAIL_FILE}`); return false; }
    const session = this.sessionStore.page(`${BOOK_DETAIL_FILE}::book-detail`);
    session.bookId = id;
    session.activeTab = ["highlights", "thoughts", "review"].includes(tab) ? tab : "highlights";
    if (targetLeaf.view?.getViewType?.() === BOOK_DETAIL_VIEW_TYPE && typeof targetLeaf.view.refreshModel === "function") {
      await targetLeaf.view.refreshModel("navigation");
      return true;
    }
    await targetLeaf.setViewState({ type: BOOK_DETAIL_VIEW_TYPE, active: true, state: { file: BOOK_DETAIL_FILE } });
    return true;
  }

  async openKnowledge(tab = "content", options = {}, leaf = null) {
    const targetLeaf = leaf || this.app.workspace.activeLeaf || null;
    if (!targetLeaf) return false;
    const file = this.app.vault.getAbstractFileByPath(normalizePath(KNOWLEDGE_FILE));
    if (!file) { console.error(`[Weread UI V2] 未找到页面：${KNOWLEDGE_FILE}`); return false; }
    const session = this.sessionStore.page(`${KNOWLEDGE_FILE}::knowledge`);
    const aliases = { assets: "content", insights: "content", content: "content", sources: "sources", fields: "fields" };
    session.activeTab = aliases[tab] ?? "content";
    if (options.bookId || options.bookPath) session.selectedBook = String(options.bookId ?? options.bookPath ?? "");
    if (options.field !== undefined) session.selectedField = String(options.field ?? "");
    if (targetLeaf.view?.getViewType?.() === KNOWLEDGE_VIEW_TYPE && typeof targetLeaf.view.refreshModel === "function") {
      await targetLeaf.view.refreshModel("navigation");
      return true;
    }
    await targetLeaf.setViewState({ type: KNOWLEDGE_VIEW_TYPE, active: true, state: { file: KNOWLEDGE_FILE } });
    return true;
  }

  async openHome(leaf = null) {
    const targetLeaf = leaf || this.app.workspace.activeLeaf || null;
    if (!targetLeaf) return false;
    const file = this.app.vault.getAbstractFileByPath(normalizePath(HOME_FILE));
    if (!file) { console.error(`[Weread UI V2] 未找到页面：${HOME_FILE}`); return false; }
    await targetLeaf.setViewState({ type: HOME_VIEW_TYPE, active: true, state: { file: HOME_FILE } });
    return true;
  }

  async openReview(period = "week", leaf = null) {
    const targetLeaf = leaf || this.app.workspace.activeLeaf || null;
    if (!targetLeaf) return false;
    const file = this.app.vault.getAbstractFileByPath(normalizePath(REVIEW_CENTER_FILE));
    if (!file) { console.error(`[Weread UI V2] 未找到页面：${REVIEW_CENTER_FILE}`); return false; }
    const session = this.sessionStore?.page?.(`${REVIEW_CENTER_FILE}::review-center`);
    if (session && ["week", "month", "year"].includes(period)) {
      session.activePeriod = period;
      const current = currentReviewPeriodContext();
      const key = period === "week" ? current.weekKey : period === "month" ? current.monthKey : String(current.year);
      session.selectedByKind = { ...(session.selectedByKind ?? {}), [period]: reviewVirtualPath(period, key) };
    }
    await targetLeaf.setViewState({ type: REVIEW_VIEW_TYPE, active: true, state: { file: REVIEW_CENTER_FILE } });
    return true;
  }

  async openShelf(leaf = null) {
    const targetLeaf = leaf || this.app.workspace.activeLeaf || null;
    if (!targetLeaf) return false;
    const file = this.app.vault.getAbstractFileByPath(normalizePath(SHELF_FILE));
    if (!file) { console.error(`[Weread UI V2] 未找到页面：${SHELF_FILE}`); return false; }
    await targetLeaf.setViewState({ type: SHELF_VIEW_TYPE, active: true, state: { file: SHELF_FILE } });
    return true;
  }
}

function frontmatterFor(app, path) {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) return { file: null, frontmatter: Object.create(null) };
  const cache = app.metadataCache.getFileCache(file);
  return { file, frontmatter: cache?.frontmatter || Object.create(null) };
}

function pagesInFolder(app, folder) {
  const prefix = `${normalizePath(folder).replace(/\/+$/, "")}/`;
  return app.vault.getMarkdownFiles()
    .filter((file) => file.path.startsWith(prefix))
    .map((file) => {
      const fm = app.metadataCache.getFileCache(file)?.frontmatter || Object.create(null);
      return { ...fm, file: { path: file.path, name: file.basename } };
    });
}

function localResource(app, path) {
  const raw = normalizePath(String(path || "").replace(/^\/+/, ""));
  if (!raw) return "";
  const file = app.vault.getAbstractFileByPath(raw);
  return file ? app.vault.getResourcePath(file) : "";
}

function buildBooks(app, readingData) {
  const bookEntities = readingData?.entities?.booksById ?? {};
  const highlightEntities = readingData?.entities?.highlightsById ?? {};
  const thoughtEntities = readingData?.entities?.thoughtsById ?? {};
  const reviewEntities = readingData?.entities?.reviewsById ?? {};
  const localReviews = new Map(
    pagesInFolder(app, BOOK_REVIEW_FOLDER)
      .filter((page) => page.type === "local-book-review" && String(page.book_id ?? "").trim())
      .map((page) => [String(page.book_id), page])
  );
  const bookIds = Array.isArray(readingData?.indexes?.bookIds) ? readingData.indexes.bookIds : Object.keys(bookEntities);
  return bookIds.map((id) => bookEntities[id]).filter(Boolean).map((book) => {
    const local = String(book.coverLocalPath ?? "");
    const cover = (local ? localResource(app, local) : "") || String(book.coverRemoteUrl ?? "");
    const bookId = String(book.id ?? "");
    const localReview = localReviews.get(bookId) ?? null;
    return {
      id: bookId,
      title: String(book.title ?? "未命名书籍"),
      subtitle: String(book.translator ?? ""),
      detailSubtitle: String(book.subtitle ?? ""),
      author: String(book.author ?? ""),
      cover,
      coverRemoteUrl: String(book.coverRemoteUrl ?? ""),
      progress: book.progress === null || book.progress === undefined ? null : Number(book.progress),
      status: String(book.status ?? ""),
      highlights: (readingData?.indexes?.highlightIdsByBookId?.[bookId] ?? []).map((recordId) => highlightEntities[recordId]).filter(Boolean).length,
      thoughts: (readingData?.indexes?.thoughtIdsByBookId?.[bookId] ?? []).map((recordId) => thoughtEntities[recordId]).filter(Boolean).length,
      field: String(book.category ?? "未分类").split(/[-—/]/)[0].trim() || "未分类",
      lastRead: dateValue(book.lastReadAt),
      modifiedAt: dateValue(book.asOf),
      finishedDate: dateValue(book.finishedAt),
      wereadUrl: String(book.deepLink ?? ""),
      readerUrl: String(book.readerUrl ?? ""),
      readingSeconds: book.readingSeconds === null || book.readingSeconds === undefined ? null : Number(book.readingSeconds),
      highlightRecords: (readingData?.indexes?.highlightIdsByBookId?.[bookId] ?? []).map((recordId) => highlightEntities[recordId]).filter(Boolean),
      thoughtRecords: (readingData?.indexes?.thoughtIdsByBookId?.[bookId] ?? []).map((recordId) => thoughtEntities[recordId]).filter(Boolean),
      reviewRecords: (readingData?.indexes?.reviewIdsByBookId?.[bookId] ?? []).map((recordId) => reviewEntities[recordId]).filter(Boolean),
      localReview: String(localReview?.review ?? localReview?.book_review ?? "").trim(),
      localReviewPath: String(localReview?.file?.path ?? ""),
    };
  });
}

function computedBookStatus(book) {
  const status = String(book?.status ?? "").toLowerCase();
  const progress = book?.progress !== null && book?.progress !== undefined && Number.isFinite(Number(book.progress)) ? Number(book.progress) : null;
  if (status === "finished" || status.includes("已读完") || status.includes("已完成") || progress === 100) return "已读完";
  if (status === "reading" || status.includes("正在") || status.includes("在读") || (progress !== null && progress > 0 && progress < 100)) return "正在阅读";
  return "其他";
}

function formatDateZh(date, withTime = false) {
  const value = dateValue(date);
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", withTime
    ? { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }
    : { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }
  ).format(value).replace(/\//g, "-");
}

function formatHoursMinutes(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return "-";
  const totalMinutes = Math.floor(value / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}时${minutes}分`;
}

function durationMetricParts(seconds) {
  if (seconds === null || seconds === undefined || seconds === "") return { kind: "duration", valid: false, hours: 0, minutes: 0 };
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return { kind: "duration", valid: false, hours: 0, minutes: 0 };
  const totalMinutes = Math.floor(value / 60);
  return {
    kind: "duration",
    valid: true,
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

function fillMetricNumber(node, value, unit = "", unitTag = "small") {
  node.replaceChildren();
  if (value && typeof value === "object" && value.kind === "duration") {
    if (!value.valid) {
      node.textContent = "-";
      return node;
    }
    node.appendChild(document.createTextNode(String(value.hours)));
    node.appendChild(el(unitTag, "wrdn-metric-unit", "时"));
    node.appendChild(document.createTextNode(String(value.minutes)));
    node.appendChild(el(unitTag, "wrdn-metric-unit", "分"));
    return node;
  }
  node.appendChild(document.createTextNode(String(value ?? "-")));
  if (unit) node.appendChild(el(unitTag, "wrdn-metric-unit", unit));
  return node;
}

function splitMetricText(raw, defaultUnit = "") {
  const text = String(raw ?? "").trim();
  if (!text || text === "暂无" || text === "无" || text === "null" || text === "undefined" || text === "NaN") return { value: "-", unit: defaultUnit.trim() };
  if (text === "-") return { value: "-", unit: defaultUnit.trim() };
  const match = text.match(/^([\d.]+)\s*(.*)$/);
  return match ? { value: match[1], unit: (match[2] || defaultUnit).trim() } : { value: text, unit: defaultUnit.trim() };
}

function displayCount(value, fallback = null) {
  for (const candidate of [value, fallback]) {
    if (candidate === null || candidate === undefined || candidate === "") continue;
    const number = Number(candidate);
    if (Number.isFinite(number) && number >= 0) return String(number);
    const text = String(candidate).trim();
    if (text) return text;
  }
  return "-";
}

function pageButton(label, className = "wrdn-p-btn", handler = null, iconName = "") {
  const button = el("button", className);
  button.type = "button";
  if (iconName) button.appendChild(pageIcon(iconName));
  button.appendChild(el("span", "", label));
  if (handler) button.addEventListener("click", handler);
  return button;
}

function clickableNode(node, handler, label = "") {
  node.classList.add("is-clickable");
  node.tabIndex = 0;
  node.setAttribute("role", "button");
  if (label) node.setAttribute("aria-label", label);
  node.addEventListener("click", handler);
  node.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); handler(event); }
  });
  return node;
}

function pageBadge(text, className = "") {
  return el("span", `wrdn-p-badge ${className}`.trim(), text);
}

function progressBar(value) {
  const node = el("div", "wrdn-p-progress");
  const fill = el("i");
  fill.style.width = `${Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : 0}%`;
  node.appendChild(fill);
  return node;
}

function pageCoverNode(book, className = "wrdn-p-cover") {
  const node = el("div", className);
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", `${book?.title || "书籍"}封面`);
  if (book?.cover) {
    const image = document.createElement("img");
    image.src = book.cover;
    image.alt = `${book.title}封面`;
    image.loading = "lazy";
    image.decoding = "async";
    image.className = "wrdn-cover-image";
    node.classList.add("has-cover-image");
    node.appendChild(image);
  } else node.appendChild(el("span", "", book?.title || "书籍"));
  return node;
}

function pageEmpty(message, className = "wrdn-p-empty") {
  return append(el("div", className), pageIcon("note"), el("p", "", message));
}

function safeFileName(value) {
  return String(value ?? "未命名").replace(/[\\/:*?"<>|#\[\]]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "未命名";
}

// Native UI runs in its own bundle scope. Keep every filesystem helper used by
// interactive editors inside this scope so saving never depends on bootstrap
// helpers from another IIFE.
async function ensureUiVaultFolder(app, folderPath) {
  const normalized = normalizePath(String(folderPath ?? "")).replace(/^\/+|\/+$/g, "");
  if (!normalized) return;
  const parts = normalized.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (app.vault.getAbstractFileByPath(current)) continue;
    try {
      await app.vault.createFolder(current);
    } catch (error) {
      // Obsidian can race folder creation through another view. Treat an
      // already-created folder as success; surface every other failure.
      if (!app.vault.getAbstractFileByPath(current)) throw error;
    }
  }
}

function normalizedBookContent(book) {
  const normalize = (raw, type) => ({
    id: String(raw?.id ?? ""),
    type,
    text: String(raw?.text ?? "").trim(),
    note: type === "thought" ? String(raw?.note ?? "").trim() : "",
    quote: type === "thought" ? String(raw?.abstract ?? raw?.quote ?? "").trim() : "",
    chapter: String(raw?.chapter ?? "").trim(),
    created: dateValue(raw?.createdAt ?? raw?.created),
    deepLink: String(raw?.deepLink ?? book?.wereadUrl ?? ""),
  });
  const highlights = (book?.highlightRecords ?? []).map((raw) => normalize(raw, "highlight")).filter((row) => row.text)
    .sort((a, b) => (a.created?.getTime() ?? 0) - (b.created?.getTime() ?? 0));
  const thoughts = (book?.thoughtRecords ?? []).map((raw) => normalize(raw, "thought")).filter((row) => row.text)
    .sort((a, b) => (a.created?.getTime() ?? 0) - (b.created?.getTime() ?? 0));
  const syncedReview = [...(book?.reviewRecords ?? [])]
    .sort((a, b) => (dateValue(b?.createdAt)?.getTime() ?? 0) - (dateValue(a?.createdAt)?.getTime() ?? 0))[0];
  return { highlights, thoughts, syncedReview: String(syncedReview?.text ?? "").trim() };
}

function deriveThoughtQuotes(thoughts, highlights) {
  const used = new Set();
  return thoughts.map((item, index) => {
    if (item.quote) return item;
    const sameChapter = highlights.filter((quote, i) => !used.has(i) && quote.chapter && item.chapter && quote.chapter === item.chapter);
    const dated = sameChapter.filter((quote) => quote.created && item.created && quote.created <= item.created);
    let selected = dated[dated.length - 1] ?? sameChapter[sameChapter.length - 1] ?? null;
    if (!selected) {
      const before = highlights.filter((quote, i) => !used.has(i) && quote.created && item.created && quote.created <= item.created);
      selected = before[before.length - 1] ?? null;
    }
    if (!selected) selected = highlights[Math.min(index, Math.max(0, highlights.length - 1))] ?? null;
    const selectedIndex = selected ? highlights.indexOf(selected) : -1;
    if (selectedIndex >= 0) used.add(selectedIndex);
    return { ...item, quote: selected?.text ?? "" };
  });
}

async function saveLocalBookReview(plugin, book, reviewText) {
  const bookId = String(book?.id ?? "").trim();
  if (!bookId) return false;
  if (!plugin.app.fileManager?.processFrontMatter) return false;
  const value = String(reviewText ?? "").trim();
  try {
    await ensureUiVaultFolder(plugin.app, BOOK_REVIEW_FOLDER);
    const path = normalizePath(book.localReviewPath || `${BOOK_REVIEW_FOLDER}/${safeFileName(bookId)}.md`);
    let file = plugin.app.vault.getAbstractFileByPath(path);
    if (!file) {
      file = await plugin.app.vault.create(path, [
        "---", "type: local-book-review", `book_id: ${JSON.stringify(bookId)}`, `book_title: ${JSON.stringify(book.title)}`,
        'review: ""', `updated_at: ${new Date().toISOString()}`, "---", "", `# ${book.title} · 我的书评`, "",
        "> 本文件由阅读看板维护，不会被微信读书同步覆盖。", "",
      ].join("\n"));
      book.localReviewPath = file.path;
    }
    await plugin.contentStore.runOwnWrite(path, () => plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
      // book_id is the storage identity: each book owns exactly one local review.
      frontmatter.type = "local-book-review";
      frontmatter.book_id = bookId;
      frontmatter.book_title = book.title;
      frontmatter.review = value;
      frontmatter.updated_at = new Date().toISOString();
    }));
    book.localReview = value;
    return true;
  } catch (error) {
    console.error("[Weread UI V2] 保存书评失败", error);
    return false;
  }
}

async function openWereadReader(plugin, readingData, book) {
  const configured = String(plugin?.settings?.bookOpenMode ?? "browser");
  const mode = ["browser", "webviewer"].includes(configured) ? configured : "browser";
  const imported = /^CB_/i.test(String(book?.id ?? "")) || /\/wrepub\//i.test(String(book?.coverRemoteUrl ?? book?.cover ?? ""));
  if (imported) {
    return { ok: false, message: "该书为微信读书导入书，微信读书网页版暂不支持继续阅读。" };
  }
  const url = String(book?.readerUrl ?? "").trim();
  if (!url) {
    return { ok: false, message: "当前书籍缺少微信读书网页版阅读地址。" };
  }
  if (mode === "browser") {
    try {
      window.open(url, "_blank", "noopener,noreferrer");
      return { ok: true, message: "" };
    } catch (error) {
      console.error("[Weread Reading Dashboard] 无法打开系统浏览器", error);
      return { ok: false, message: "无法打开系统浏览器。" };
    }
  }
  try {
    const leaf = plugin.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: "webviewer", state: { url, navigate: true }, active: true });
    plugin.app.workspace.setActiveLeaf?.(leaf, { focus: true });
    return { ok: true, message: "" };
  } catch (error) {
    console.error("[Weread Reading Dashboard] 无法打开网页浏览器", error);
    return { ok: false, message: "无法在 Obsidian 内打开。请先开启核心插件-网页浏览器，或在设置中改用系统浏览器。" };
  }
}

function buildInspirationRecords(books) {
  const records = [];
  for (const book of books) {
    for (const raw of book.highlightRecords) {
      const text = String(raw?.text ?? "").replace(/\s+/g, " ").trim();
      if (text.length >= 6) records.push({ key: `highlight|${book.id}|${raw?.id ?? text}`, type: "highlight", text, chapter: String(raw?.chapter ?? ""), created: dateValue(raw?.createdAt), book });
    }
    for (const raw of book.thoughtRecords) {
      const text = String(raw?.text ?? "").replace(/\s+/g, " ").trim();
      if (text.length >= 6) records.push({ key: `thought|${book.id}|${raw?.id ?? text}`, type: "thought", text, chapter: String(raw?.chapter ?? ""), created: dateValue(raw?.createdAt), book });
    }
  }
  const seen = new Set();
  return records.filter((record) => {
    const key = `${record.type}|${record.book.id}|${record.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function buildHomeModel(plugin, load) {
  const readingData = load.data || emptyReadingData();
  const books = buildBooks(plugin.app, readingData);
  const orderedBooks = [...books].sort((a, b) =>
    (b.lastRead?.getTime() ?? -1) - (a.lastRead?.getTime() ?? -1) ||
    (b.modifiedAt?.getTime() ?? -1) - (a.modifiedAt?.getTime() ?? -1) ||
    a.title.localeCompare(b.title, "zh-CN")
  );
  const { file: configFile, frontmatter: configFm } = frontmatterFor(plugin.app, CONFIG_FILE);
  const reviewPages = pagesInFolder(plugin.app, REVIEW_FOLDER)
    .filter((page) => page.type === "reading-review" && !page.template && !String(page.file?.name ?? "").includes("模板"));
  const { todayKey, weekKey: activeWeekKey, monthKey: activeMonthKey, year: activeYear } = currentReviewPeriodContext();
  const canonicalReview = (path) => {
    const { file, frontmatter } = frontmatterFor(plugin.app, path);
    return file ? { ...frontmatter, file: { path: file.path, name: file.basename } } : null;
  };
  const weekReview = canonicalReview(`${REVIEW_FOLDER}/周/${activeWeekKey}.md`)
    ?? reviewPages.find((page) => String(page.week ?? "") === activeWeekKey)
    ?? {};
  const monthReview = canonicalReview(`${REVIEW_FOLDER}/月/${activeMonthKey}.md`)
    ?? reviewPages.find((page) => String(page.month ?? "") === activeMonthKey || (String(page.review_period ?? "") === "month" && Number(page.year) === activeYear && Number(page.month_number) === Number(todayKey.slice(5, 7))))
    ?? {};
  const yearReview = canonicalReview(`${REVIEW_FOLDER}/年/${activeYear}.md`)
    ?? reviewPages.find((page) => Number(page.year ?? 0) === activeYear && (String(page.review_period ?? "") === "year" || (!page.week && !page.month)))
    ?? {};
  const dataDays = readingData?.reading?.days ?? {};
  const logs = Object.entries(dataDays).map(([key, row]) => ({
    key,
    date: dateValue(`${key}T12:00:00+08:00`),
    seconds: Math.max(0, Number(row?.seconds ?? 0)),
  })).filter((row) => row.date).sort((a, b) => a.date - b.date);
  const todayBookId = String(readingData?.views?.home?.todayBookId ?? "");
  const todayBook = books.find((book) => book.id === todayBookId) ?? books.find((book) => computedBookStatus(book) === "正在阅读") ?? books[0] ?? {};
  const todayCovered = Object.prototype.hasOwnProperty.call(dataDays, todayKey);
  const todayMinutes = todayCovered ? Math.max(0, Number(dataDays[todayKey]?.seconds ?? 0)) / 60 : null;
  const sourceBookLimit = Math.max(1, Number(configFm.source_book_limit ?? 4));
  const fieldLimit = Math.max(1, Number(configFm.reading_field_limit ?? 6));
  const sourceBookDistribution = [...books]
    .map((book) => ({ ...book, contentCount: Math.max(0, book.highlights) + Math.max(0, book.thoughts) }))
    .filter((book) => book.contentCount > 0)
    .sort((a, b) => b.contentCount - a.contentCount || (b.lastRead?.getTime() ?? 0) - (a.lastRead?.getTime() ?? 0) || a.title.localeCompare(b.title, "zh-CN"))
    .slice(0, sourceBookLimit);
  const fieldFrequency = new Map();
  for (const book of books) {
    const field = book.field || "未分类";
    const row = fieldFrequency.get(field) ?? { field, books: 0, highlights: 0, thoughts: 0 };
    row.books += 1;
    row.highlights += Math.max(0, book.highlights);
    row.thoughts += Math.max(0, book.thoughts);
    fieldFrequency.set(field, row);
  }
  const readingFieldDistribution = [...fieldFrequency.values()]
    .sort((a, b) => b.books - a.books || (b.highlights + b.thoughts) - (a.highlights + a.thoughts) || a.field.localeCompare(b.field, "zh-CN"))
    .slice(0, fieldLimit);

  return {
    load,
    readingData,
    books,
    orderedBooks,
    configFile,
    config: configFm,
    reviews: { week: weekReview, month: monthReview, year: yearReview },
    todayKey,
    activeMonthKey,
    activeYear,
    activeWeekKey,
    todayBook,
    todayMinutes,
    logs,
    dataDays,
    dataMonths: readingData?.reading?.months ?? {},
    dataYears: readingData?.reading?.years ?? {},
    dataOverall: readingData?.reading?.overall ?? null,
    highlightEntities: readingData?.entities?.highlightsById ?? {},
    thoughtEntities: readingData?.entities?.thoughtsById ?? {},
    sourceBookDistribution,
    readingFieldDistribution,
    inspirationRecords: buildInspirationRecords(books),
    knowledgeHighlightsTotal: books.reduce((sum, book) => sum + Math.max(0, book.highlights), 0),
    knowledgeThoughtsTotal: books.reduce((sum, book) => sum + Math.max(0, book.thoughts), 0),
    dailyGoal: Math.min(1440, Math.max(5, Math.round(Number(configFm.daily_goal_minutes ?? 30) || 30))),
  };
}


function reviewFocusKey(kind) {
  return kind === "week" ? "next_week_focus" : kind === "month" ? "next_month_focus" : "next_year_focus";
}

function reviewKindOf(page) {
  const period = String(page?.review_period ?? "").trim();
  if (page?.week || period === "week") return "week";
  if (page?.month || period === "month") return "month";
  return "year";
}

function pad2(value) { return String(value).padStart(2, "0"); }

function extractReviewMonth(value, fallback = "") {
  const raw = String(value ?? fallback ?? "").trim();
  const match = raw.match(/(\d{4})[-/.年](\d{1,2})/);
  if (match) return `${match[1]}-${pad2(match[2])}`;
  return raw.match(/^(\d{4}-\d{2})/)?.[1] ?? raw;
}

function extractReviewYear(value, fallback = "") {
  return String(value ?? fallback ?? "").match(/\d{4}/)?.[0] ?? String(value ?? fallback ?? "");
}

function reviewSortStamp(page) {
  const kind = reviewKindOf(page);
  if (kind === "week") return String(page.week ?? page.file?.name ?? "");
  if (kind === "month") return extractReviewMonth(page.month, page.file?.name ?? "");
  return extractReviewYear(page.year, page.file?.name ?? "");
}

function formatReviewPeriod(page) {
  const kind = reviewKindOf(page);
  if (kind === "week") return String(page.week ?? page.file?.name ?? "未命名回顾");
  if (kind === "month") {
    const raw = extractReviewMonth(page.month, page.file?.name ?? "");
    const match = raw.match(/^(\d{4})-(\d{2})$/);
    return match ? `${match[1]} 年 ${Number(match[2])} 月` : (raw || String(page.file?.name ?? "未命名回顾"));
  }
  const year = extractReviewYear(page.year, page.file?.name ?? "未命名回顾");
  return `${year} 年`;
}

function reviewLabels(kind) {
  return kind === "week"
    ? { gain: "我的本周收获", focus: "下周阅读重点" }
    : kind === "month"
      ? { gain: "我的本月收获", focus: "下月阅读重点" }
      : { gain: "我的年度收获", focus: "下一年度阅读重点" };
}

function formatReviewDotDate(value) {
  const key = todayKeyShanghai(value);
  const [year, month, day] = String(key).split("-").map(Number);
  return Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? `${year}.${month}.${day}`
    : "";
}

function reviewRangeText(page) {
  const bounds = reviewDateBounds(page);
  if (bounds.start && bounds.end) {
    const start = formatReviewDotDate(bounds.start);
    const end = formatReviewDotDate(bounds.end);
    if (start && end) return `${start}-${end}`;
  }
  return formatReviewPeriod(page);
}

function reviewListTitle(page) {
  const kind = reviewKindOf(page);
  if (kind === "week") return formatReviewPeriod(page);
  if (kind === "month") {
    const raw = extractReviewMonth(page.month, page.file?.name ?? "");
    const match = raw.match(/^(\d{4})-(\d{2})$/);
    return match ? `${match[1]} 年 ${Number(match[2])} 月回顾` : `${raw} 回顾`;
  }
  return `${extractReviewYear(page.year, page.file?.name ?? "")} 年回顾`;
}

function reviewDetailTitle(page) {
  return reviewKindOf(page) === "week" ? `${formatReviewPeriod(page)} 阅读回顾` : reviewListTitle(page);
}

function reviewDateBounds(page) {
  const kind = reviewKindOf(page);
  const current = currentReviewPeriodContext(new Date());
  const todayEnd = new Date(`${current.todayKey}T23:59:59.999+08:00`);
  const clampCurrentEnd = (key, end) => {
    const isCurrent = kind === "week" ? key === current.weekKey : kind === "month" ? key === current.monthKey : Number(key) === current.year;
    return isCurrent && end > todayEnd ? todayEnd : end;
  };
  if (kind === "week") {
    const keyMatch = String(page.week ?? page.file?.name ?? "").match(/(\d{4})-W(\d{1,2})/i);
    const weekKey = keyMatch ? `${keyMatch[1]}-W${String(Number(keyMatch[2])).padStart(2, "0")}` : "";
    const explicit = String(page.period ?? "").match(/(\d{4}-\d{2}-\d{2})[\s\S]*?(\d{4}-\d{2}-\d{2})/);
    if (explicit) {
      const start = new Date(`${explicit[1]}T00:00:00+08:00`);
      const end = new Date(`${explicit[2]}T23:59:59.999+08:00`);
      return { start, end: clampCurrentEnd(weekKey, end) };
    }
    if (keyMatch) {
      const year = Number(keyMatch[1]);
      const week = Number(keyMatch[2]);
      const jan4 = new Date(Date.UTC(year, 0, 4));
      const jan4Day = jan4.getUTCDay() || 7;
      const monday = new Date(Date.UTC(year, 0, 4 - (jan4Day - 1) + (week - 1) * 7));
      const start = new Date(`${monday.getUTCFullYear()}-${pad2(monday.getUTCMonth() + 1)}-${pad2(monday.getUTCDate())}T00:00:00+08:00`);
      const end = new Date(start.getTime() + 7 * 86400000 - 1);
      return { start, end: clampCurrentEnd(weekKey, end) };
    }
  }
  if (kind === "month") {
    const raw = extractReviewMonth(page.month, page.file?.name ?? "");
    const match = raw.match(/^(\d{4})-(\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const start = new Date(`${year}-${pad2(month)}-01T00:00:00+08:00`);
      const nextYear = month === 12 ? year + 1 : year;
      const nextMonth = month === 12 ? 1 : month + 1;
      const next = new Date(`${nextYear}-${pad2(nextMonth)}-01T00:00:00+08:00`);
      return { start, end: clampCurrentEnd(raw, new Date(next.getTime() - 1)) };
    }
  }
  const year = Number(extractReviewYear(page.year, page.file?.name ?? ""));
  if (Number.isFinite(year) && year > 0) {
    const start = new Date(`${year}-01-01T00:00:00+08:00`);
    const next = new Date(`${year + 1}-01-01T00:00:00+08:00`);
    return { start, end: clampCurrentEnd(year, new Date(next.getTime() - 1)) };
  }
  return { start: null, end: null };
}

function exactDurationZh(value) {
  return formatHoursMinutes(Math.max(0, Number(value) || 0));
}

function shanghaiDayIndex(value) {
  const key = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayKeyShanghai(value);
  const [year, month, day] = String(key).split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function relativeDayLabel(value, now = new Date()) {
  const date = dateValue(value);
  if (!date) return "—";
  const diff = shanghaiDayIndex(now) - shanghaiDayIndex(date);
  if (diff <= 0) return "今天";
  if (diff === 1) return "昨天";
  return `${diff} 天前`;
}

function activityFromDailySeconds(rawDaily) {
  const dailySeconds = {};
  if (rawDaily && typeof rawDaily === "object") {
    for (const [key, value] of Object.entries(rawDaily)) {
      dailySeconds[key] = Math.max(0, Number(value) || 0);
    }
  }
  const entries = Object.entries(dailySeconds);
  return {
    dailySeconds,
    totalSeconds: entries.reduce((sum, [, seconds]) => sum + seconds, 0),
    readDays: entries.filter(([, seconds]) => seconds >= 60).length,
  };
}

function periodActivityStats(fact, fallbackRows = []) {
  const rawDaily = fact?.dailySeconds && typeof fact.dailySeconds === "object" ? fact.dailySeconds : null;
  const daily = activityFromDailySeconds(rawDaily);
  const dailyPresent = Object.keys(daily.dailySeconds).length > 0;
  const hasTotal = fact?.totalSeconds !== null && fact?.totalSeconds !== undefined && Number.isFinite(Number(fact.totalSeconds));
  const hasDays = fact?.readDays !== null && fact?.readDays !== undefined && Number.isFinite(Number(fact.readDays));
  const totalRaw = hasTotal ? Math.max(0, Number(fact.totalSeconds)) : null;
  const daysRaw = hasDays ? Math.max(0, Math.round(Number(fact.readDays))) : null;
  const fallback = Array.isArray(fallbackRows)
    ? fallbackRows.map((row) => ({ key: String(row?.key ?? ""), seconds: Math.max(0, Number(row?.seconds) || 0) }))
    : [];
  const fallbackTotal = fallback.length ? fallback.reduce((sum, row) => sum + row.seconds, 0) : null;
  const fallbackDays = fallback.length ? new Set(fallback.filter((row) => row.seconds >= 60).map((row) => row.key)).size : null;
  return {
    // totalReadTime/readDays are the canonical period metrics. Daily buckets are
    // detail data for heatmaps/trends and only become a fallback if the period
    // aggregate is absent.
    totalSeconds: hasTotal ? totalRaw : dailyPresent ? daily.totalSeconds : fallbackTotal,
    readDays: hasDays ? daysRaw : dailyPresent ? daily.readDays : fallbackDays,
    dailySeconds: daily.dailySeconds,
    source: hasTotal || hasDays ? "period" : dailyPresent ? "daily-fallback" : fallback.length ? "fallback" : "missing",
  };
}

function roundedPercentages(values) {
  const safe = values.map((value) => Math.max(0, Number(value) || 0));
  const total = safe.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return safe.map(() => 0);
  const exact = safe.map((value) => value / total * 100);
  const floors = exact.map(Math.floor);
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < order.length && remainder > 0; i += 1, remainder -= 1) floors[order[i].index] += 1;
  return floors;
}

function periodFactForReview(readingData, page) {
  const kind = reviewKindOf(page);
  if (kind === "week") {
    const key = String(page.week ?? page.file?.name ?? "").match(/(\d{4}-W\d{1,2})/i)?.[1];
    return key ? readingData?.reading?.weeks?.[key.replace(/W(\d)$/i, "W0$1")] ?? null : null;
  }
  if (kind === "month") return readingData?.reading?.months?.[extractReviewMonth(page.month, page.file?.name ?? "")] ?? null;
  return readingData?.reading?.years?.[extractReviewYear(page.year, page.file?.name ?? "")] ?? null;
}

function reviewMetricValues(model, page) {
  const fact = periodFactForReview(model.readingData, page);
  const activity = periodActivityStats(fact);
  const duration = durationMetricParts(activity.totalSeconds);
  const readDays = activity.readDays;
  const bounds = reviewDateBounds(page);
  const countInRange = (records) => {
    if (!bounds.start || !bounds.end) return null;
    let count = 0;
    for (const record of Object.values(records ?? {})) {
      const created = recordCreatedDate(record);
      if (created && created >= bounds.start && created <= bounds.end) count += 1;
    }
    return count;
  };
  const highlights = countInRange(model.highlightEntities);
  const thoughts = countInRange(model.thoughtEntities);
  return [
    [duration, "", "阅读时长"],
    [readDays === null ? "-" : String(readDays), readDays === null ? "" : "天", "阅读天数"],
    [highlights === null ? "-" : String(highlights), highlights === null ? "" : "条", "划线"],
    [thoughts === null ? "-" : String(thoughts), thoughts === null ? "" : "条", "想法"],
  ];
}

function reviewVirtualPath(kind, key) {
  return `${REVIEW_FOLDER}/${kind === "week" ? "周" : kind === "month" ? "月" : "年"}/${key}.md`;
}

function buildVirtualReviewPages(readingData) {
  return [
    ...Object.entries(readingData?.reading?.weeks ?? {}).map(([key, fact]) => ({
      type: "reading-review", review_period: "week", week: key,
      period: fact?.startDate && fact?.endDate ? `${fact.startDate} — ${fact.endDate}` : "",
      file: { path: reviewVirtualPath("week", key), name: key }, __wrdVirtual: true,
    })),
    ...Object.keys(readingData?.reading?.months ?? {}).map((key) => ({
      type: "reading-review", review_period: "month", month: key,
      file: { path: reviewVirtualPath("month", key), name: key }, __wrdVirtual: true,
    })),
    ...Object.keys(readingData?.reading?.years ?? {}).map((key) => ({
      type: "reading-review", review_period: "year", year: Number(key),
      file: { path: reviewVirtualPath("year", key), name: key }, __wrdVirtual: true,
    })),
  ];
}

function buildCurrentReviewPages(date = new Date()) {
  const { weekKey, monthKey, year } = currentReviewPeriodContext(date);
  const week = {
    type: "reading-review", review_period: "week", week: weekKey,
    file: { path: reviewVirtualPath("week", weekKey), name: weekKey }, __wrdVirtual: true, __wrdCurrent: true,
  };
  const bounds = reviewDateBounds(week);
  if (bounds.start && bounds.end) week.period = `${todayKeyShanghai(bounds.start)} — ${todayKeyShanghai(bounds.end)}`;
  return [
    week,
    { type: "reading-review", review_period: "month", month: monthKey, file: { path: reviewVirtualPath("month", monthKey), name: monthKey }, __wrdVirtual: true, __wrdCurrent: true },
    { type: "reading-review", review_period: "year", year, file: { path: reviewVirtualPath("year", String(year)), name: String(year) }, __wrdVirtual: true, __wrdCurrent: true },
  ];
}

function reviewIdentity(page) {
  const kind = reviewKindOf(page);
  if (kind === "week") return `week:${String(page.week ?? page.file?.name ?? "").trim()}`;
  if (kind === "month") return `month:${extractReviewMonth(page.month, page.file?.name ?? "")}`;
  return `year:${extractReviewYear(page.year, page.file?.name ?? "")}`;
}

async function buildReviewCenterModel(plugin, load) {
  const readingData = load.data || emptyReadingData();
  const saved = pagesInFolder(plugin.app, REVIEW_FOLDER)
    .filter((page) => page.type === "reading-review" && !page.template && !String(page.file?.name ?? "").includes("模板"));
  const map = new Map();
  for (const page of buildVirtualReviewPages(readingData)) map.set(reviewIdentity(page), page);
  for (const page of buildCurrentReviewPages()) map.set(reviewIdentity(page), page);
  for (const page of saved) map.set(reviewIdentity(page), page);
  return {
    load,
    readingData,
    books: buildBooks(plugin.app, readingData),
    reviews: [...map.values()],
    highlightEntities: readingData?.entities?.highlightsById ?? {},
    thoughtEntities: readingData?.entities?.thoughtsById ?? {},
  };
}

function historyReadBookCount(books) {
  return books.filter((book) => {
    const progress = book.progress !== null && book.progress !== undefined && Number.isFinite(Number(book.progress)) ? Number(book.progress) : 0;
    return computedBookStatus(book) !== "其他" || progress > 0 || Number(book.readingSeconds ?? 0) > 0 || Boolean(book.lastRead) || Boolean(book.finishedDate);
  }).length;
}

function officialCount(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function historyMetricValues(model) {
  const books = Array.isArray(model.books) ? model.books : [];
  const overall = model.readingData?.reading?.overall ?? null;
  const years = Object.values(model.readingData?.reading?.years ?? {});
  const hasOverallSeconds = overall?.totalSeconds !== null && overall?.totalSeconds !== undefined && Number.isFinite(Number(overall.totalSeconds));
  const yearlyActivity = years.map((row) => periodActivityStats(row));
  const totalSeconds = hasOverallSeconds
    ? Math.max(0, Number(overall.totalSeconds))
    : yearlyActivity.reduce((sum, row) => sum + Math.max(0, Number(row.totalSeconds ?? 0) || 0), 0);
  const overallReadDays = officialCount(overall?.readDays);
  const officialReadDays = officialCount(overall?.readStat?.readingDays);
  const yearlyReadDays = yearlyActivity.some((row) => row.readDays !== null)
    ? yearlyActivity.reduce((sum, row) => sum + Math.max(0, Number(row.readDays ?? 0) || 0), 0)
    : null;
  const readDays = overallReadDays ?? officialReadDays ?? yearlyReadDays
    ?? Object.values(model.readingData?.reading?.days ?? {}).filter((row) => Math.max(0, Number(row?.seconds ?? 0) || 0) >= 60).length;
  const highlightCount = Object.keys(model.highlightEntities ?? {}).length;
  const thoughtCount = Object.keys(model.thoughtEntities ?? {}).length;
  const noteCount = officialCount(overall?.readStat?.notes)
    ?? (highlightCount + thoughtCount || books.reduce((sum, book) => sum + Math.max(0, Number(book.highlights ?? 0)) + Math.max(0, Number(book.thoughts ?? 0)), 0));
  const entityFinished = books.filter((book) => computedBookStatus(book) === "已读完").length;
  const entityReading = books.filter((book) => computedBookStatus(book) === "正在阅读").length;
  const officialReadBooks = officialCount(overall?.readStat?.readBooks);
  const officialFinishedBooks = officialCount(overall?.readStat?.finishedBooks);
  const readBooks = officialReadBooks ?? historyReadBookCount(books);
  const finishedBooks = officialFinishedBooks ?? entityFinished;
  const readingBooks = entityReading;
  const duration = durationMetricParts(totalSeconds);
  return [
    [String(readBooks), "本", "读过"],
    [String(finishedBooks), "本", "已读完"],
    [String(readingBooks), "本", "正在读"],
    [duration, "", "阅读时长"],
    [String(readDays), "天", "阅读天数"],
    [String(noteCount), "条", "笔记数"],
  ];
}

function historyYearBounds(readingData) {
  const currentYear = Number(todayKeyShanghai(new Date()).slice(0, 4));
  const registeredText = String(readingData?.reading?.overall?.registTime ?? "").trim();
  const registeredMatch = registeredText.match(/^(?:19|20)\d{2}/)?.[0];
  const registeredYear = registeredMatch ? Number(registeredMatch) : null;
  const minYear = Number.isFinite(registeredYear) && registeredYear >= 2000 && registeredYear <= currentYear
    ? registeredYear
    : 2000;
  return { minYear, maxYear: currentYear };
}

function historyYearKey(rawKey, bounds) {
  const text = String(rawKey ?? "").trim();
  let candidate = null;
  if (/^(?:19|20)\d{2}$/.test(text)) {
    candidate = Number(text);
  } else {
    const isoYear = text.match(/^((?:19|20)\d{2})[-/.]/)?.[1];
    if (isoYear) candidate = Number(isoYear);
  }
  if (candidate === null) {
    const numeric = Number(rawKey);
    if (Number.isFinite(numeric) && numeric > 100000000) {
      const date = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
      if (!Number.isNaN(date.getTime())) candidate = Number(todayKeyShanghai(date).slice(0, 4));
    }
  }
  if (!Number.isFinite(candidate)) return "";
  if (candidate < bounds.minYear || candidate > bounds.maxYear) return "";
  return String(candidate);
}

function historyYearRows(readingData) {
  const bounds = historyYearBounds(readingData);
  const map = new Map();
  for (const [rawYear, fact] of Object.entries(readingData?.reading?.years ?? {})) {
    const year = historyYearKey(rawYear, bounds);
    const seconds = periodActivityStats(fact).totalSeconds;
    if (year && seconds !== null && Number.isFinite(Number(seconds)) && Number(seconds) > 0) map.set(year, Math.max(0, Number(seconds)));
  }
  for (const [rawKey, rawValue] of Object.entries(readingData?.reading?.overall?.yearlySeconds ?? {})) {
    const year = historyYearKey(rawKey, bounds);
    const seconds = Number(rawValue?.totalSeconds ?? rawValue);
    if (year && !map.has(year) && Number.isFinite(seconds) && seconds > 0) map.set(year, Math.max(0, seconds));
  }
  return [...map.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([year, seconds]) => ({ year, seconds }));
}

function historyHoursLabel(seconds) {
  return formatHoursMinutes(Math.max(0, Number(seconds ?? 0)));
}

function historyDurationLongLabel(seconds) {
  return formatHoursMinutes(Math.max(0, Number(seconds ?? 0)));
}

async function buildShelfModel(plugin, load) {
  const readingData = load.data || emptyReadingData();
  const books = buildBooks(plugin.app, readingData);
  return {
    load,
    readingData,
    books,
    orderedBooks: [...books].sort((a, b) =>
      (b.lastRead?.getTime() ?? -1) - (a.lastRead?.getTime() ?? -1) ||
      (b.modifiedAt?.getTime() ?? -1) - (a.modifiedAt?.getTime() ?? -1) ||
      a.title.localeCompare(b.title, "zh-CN")
    ),
  };
}


async function buildBooksPageModel(plugin, load) {
  const readingData = load.data || emptyReadingData();
  return { load, readingData, books: buildBooks(plugin.app, readingData) };
}

class HomeRenderer {
  constructor(plugin, component, model, session) {
    this.plugin = plugin;
    this.component = component;
    this.model = model;
    this.session = session;
    this.root = null;
    this.sourceStatusNode = null;
    this.refreshButton = null;
  }

  scrollContainer() {
    return this.component?.contentEl instanceof HTMLElement ? this.component.contentEl : null;
  }

  captureViewport() {
    const scroller = this.scrollContainer();
    return scroller ? { scroller, top: scroller.scrollTop, left: scroller.scrollLeft } : null;
  }

  restoreViewport(snapshot) {
    if (!snapshot?.scroller?.isConnected) return;
    snapshot.scroller.scrollTop = snapshot.top;
    snapshot.scroller.scrollLeft = snapshot.left;
  }

  withStableViewport(task) {
    const snapshot = this.captureViewport();
    const result = task();
    this.restoreViewport(snapshot);
    requestAnimationFrame(() => this.restoreViewport(snapshot));
    return result;
  }

  focusWithoutScroll(node, select = false) {
    if (!(node instanceof HTMLElement)) return;
    const snapshot = this.captureViewport();
    try { node.focus({ preventScroll: true }); }
    catch { node.focus(); }
    if (select && typeof node.select === "function") node.select();
    this.restoreViewport(snapshot);
    requestAnimationFrame(() => this.restoreViewport(snapshot));
  }

  render() {
    const root = el("div", "wrdn-dashboard");
    this.root = root;
    root.dataset.palette = String(this.component.config.palette || "暖棕");
    root.appendChild(this.safeRender("顶部标题", () => this.renderHeader()));
    const topGrid = el("div", "wrdn-top-grid");
    topGrid.appendChild(this.safeRender("今日阅读", () => this.renderToday()));
    topGrid.appendChild(this.safeRender("灵感回顾", () => this.renderInspiration()));
    root.appendChild(topGrid);
    const secondGrid = el("div", "wrdn-second-grid");
    secondGrid.appendChild(this.safeRender("知识与洞察", () => this.renderInsights()));
    secondGrid.appendChild(this.safeRender("阅读回顾与计划", () => this.renderReview()));
    root.appendChild(secondGrid);
    root.appendChild(this.safeRender("我的书架", () => this.renderShelf()));
    root.appendChild(this.safeRender("阅读节奏", () => this.renderRhythm()));
    return root;
  }

  replaceSection(selector, label, factory) {
    const current = this.root?.querySelector(selector);
    if (!current) return false;
    const next = this.safeRender(label, factory);
    this.withStableViewport(() => current.replaceWith(next));
    return true;
  }

  applyModel(nextModel, scopes = []) {
    this.model = nextModel;
    const selected = new Set(Array.isArray(scopes) ? scopes : [scopes]);
    if (selected.has("header") && this.sourceStatusNode) this.sourceStatusNode.textContent = this.defaultSourceStatus();
    if (selected.has("today")) this.replaceSection(".wrdn-today", "今日阅读", () => this.renderToday());
    if (selected.has("inspiration")) this.replaceSection(".wrdn-inspiration", "灵感回顾", () => this.renderInspiration());
    if (selected.has("insights")) this.replaceSection(".wrdn-insights", "知识与洞察", () => this.renderInsights());
    if (selected.has("review")) this.replaceSection(".wrdn-review", "阅读回顾与计划", () => this.renderReview());
    if (selected.has("shelf")) this.replaceSection(".wrdn-shelf", "我的书架", () => this.renderShelf());
    if (selected.has("rhythm")) this.replaceSection(".wrdn-rhythm", "阅读节奏", () => this.renderRhythm());
  }

  safeRender(label, renderer) {
    try { return renderer(); }
    catch (error) {
      console.error(`[Weread UI V2] ${label} 渲染失败`, error);
      const fallback = this.panel("wrdn-render-error");
      fallback.appendChild(el("h2", "wrdn-section-title", label));
      fallback.appendChild(el("div", "wrdn-render-error-message", "该模块渲染失败，请查看同步诊断或开发者控制台。"));
      return fallback;
    }
  }

  panel(className) {
    return el("section", `wrdn-panel ${className}`.trim());
  }

  sectionHeader(title, action = null, className = "") {
    const header = el("div", `wrdn-section-heading ${className}`.trim());
    header.appendChild(el("h2", "wrdn-section-title", title));
    if (action) header.appendChild(action);
    return header;
  }

  actionNode(node, handler, label = "") {
    node.classList.add("wrdn-clickable");
    node.setAttribute("role", node.tagName === "BUTTON" ? "button" : "button");
    if (node.tagName !== "BUTTON") node.setAttribute("tabindex", "0");
    if (label) node.setAttribute("aria-label", label);
    const activate = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try { await handler(event); }
      catch (error) {
        console.error("[Weread UI V2] 操作失败", error);

      }
    };
    node.addEventListener("click", activate);
    if (node.tagName !== "BUTTON") {
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") activate(event);
      });
    }
    return node;
  }

  sectionLink(label, handler, ariaLabel = "") {
    const button = el("button", "wrdn-all-books wrdn-section-link");
    button.type = "button";
    append(button, el("span", "wrdn-section-link-label", label), el("span", "wrdn-section-link-arrow", "→"));
    return this.actionNode(button, handler, ariaLabel || label);
  }

  coverNode(className, url, title) {
    const node = el("div", className);
    node.setAttribute("role", "img");
    node.setAttribute("aria-label", `${title || "书籍"}封面`);
    if (url) node.style.backgroundImage = `url(${JSON.stringify(String(url))})`;
    else {
      node.classList.add("is-fallback");
      node.appendChild(el("span", "wrdn-cover-fallback-title", title || "书籍"));
    }
    return node;
  }

  renderHeader() {
    const header = el("header", "wrdn-panel wrdn-header");
    const left = el("div", "wrdn-header-left");
    const logo = el("div", "wrdn-logo");
    logo.appendChild(icon("book"));
    append(left, logo, el("h1", "wrdn-main-title", String(this.component.config.title || "我的阅读看板")));
    const right = el("div", "wrdn-header-right wrdn-header-source");
    this.sourceStatusNode = el("span", "wrdn-source-status", this.defaultSourceStatus());
    this.refreshButton = el("button", "wrdn-refresh-button");
    this.refreshButton.type = "button";
    this.refreshButton.title = "同步微信读书并刷新看板";
    this.refreshButton.setAttribute("aria-label", "同步微信读书并刷新看板");
    this.refreshButton.appendChild(icon("sync"));
    this.refreshButton.addEventListener("click", () => {
      const firstSync = !String(this.model.readingData?.sync?.lastSuccessAt ?? "").trim();
      this.plugin.syncController.start(firstSync ? "full" : "quick");
    });
    append(right, this.sourceStatusNode, this.refreshButton);
    append(header, left, right);
    this.updateSyncStatus(this.plugin.syncController.state);
    return header;
  }

  defaultSourceStatus() {
    const last = dateValue(this.model.readingData?.sync?.lastSuccessAt);
    if (last) {
      const text = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(last).replace(/\//g, "-");
      return `数据来源：微信读书同步于 ${text}`;
    }
    return this.model.load.sourceStatus || "数据来源：尚未完成同步";
  }

  updateSyncStatus(state) {
    if (!this.sourceStatusNode || !this.refreshButton) return;
    const phase = String(state?.phase || "idle");
    const busy = phase === "starting" || phase === "progress";
    this.refreshButton.classList.toggle("is-refreshing", busy);
    this.refreshButton.disabled = busy;
    this.refreshButton.setAttribute("aria-busy", String(busy));
    if (phase === "starting") this.sourceStatusNode.textContent = "正在启动同步…";
    else if (phase === "progress") {
      const processed = Number(state?.processed ?? 0);
      const total = Number(state?.total ?? 0);
      this.sourceStatusNode.textContent = total > 0 ? `正在同步：${processed}/${total} 本` : "正在同步微信读书…";
    } else if (phase === "completed") this.sourceStatusNode.textContent = "同步完成，正在载入新数据…";
    else if (phase === "failed") this.sourceStatusNode.textContent = `同步失败：${String(state?.message || "请查看同步诊断")}`;
    else this.sourceStatusNode.textContent = this.defaultSourceStatus();
  }

  formatGoalDuration(minutes) {
    const safe = Math.min(1440, Math.max(5, Math.round(Number(minutes) || 30)));
    if (safe <= 60) return `${safe}分`;
    return `${Math.floor(safe / 60)}时${safe % 60}分`;
  }

  renderReadingTimeRing() {
    const todayRow = this.model.dataDays?.[this.model.todayKey];
    const covered = todayRow !== undefined && todayRow !== null;
    const totalSeconds = covered ? Math.max(0, Math.round(Number(todayRow?.seconds) || 0)) : null;
    const target = this.model.dailyGoal;
    const targetSeconds = Math.max(1, target * 60);
    const pct = covered ? Math.min(100, Math.max(0, totalSeconds / targetSeconds * 100)) : 0;
    const ring = el("div", `wrdn-reading-time-ring${covered && totalSeconds >= targetSeconds ? " is-complete" : ""}`);
    const displayMinutes = covered && totalSeconds > 0 ? Math.floor(totalSeconds / 60) : 0;
    const displayHours = Math.floor(displayMinutes / 60);
    const displayRestMinutes = displayMinutes % 60;
    const displayToday = displayHours > 0 ? `${displayHours}时${displayRestMinutes}分` : `${displayMinutes}分`;
    ring.title = covered ? `今日累计阅读 ${displayToday}；每日目标 ${target} 分钟` : "今日阅读时长尚未同步";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 124 124");
    svg.classList.add("wrdn-reading-time-svg");
    const track = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    track.setAttribute("cx", "62"); track.setAttribute("cy", "62"); track.setAttribute("r", "51"); track.setAttribute("pathLength", "100"); track.classList.add("wrdn-reading-time-track");
    const progress = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    progress.setAttribute("cx", "62"); progress.setAttribute("cy", "62"); progress.setAttribute("r", "51"); progress.setAttribute("pathLength", "100"); progress.style.strokeDasharray = `${pct.toFixed(2)} 100`; progress.classList.add("wrdn-reading-time-progress");
    append(svg, track, progress);
    const value = el("div", `wrdn-reading-time-value${!covered || totalSeconds <= 0 ? " is-empty" : ""}`);
    if (!covered) append(value, el("strong", "", "—"), el("span", "", "今日累计"));
    else if (totalSeconds <= 0) append(value, el("strong", "", "今天未开启"), el("span", "", "阅读"));
    else {
      const parts = el("div", "wrdn-reading-duration-parts");
      const addPart = (amount, unit) => {
        const part = el("span", "wrdn-reading-duration-part");
        append(part, el("strong", "", String(amount)), el("small", "", unit));
        parts.appendChild(part);
      };
      if (displayHours > 0) addPart(displayHours, "时");
      addPart(displayHours > 0 ? displayRestMinutes : displayMinutes, "分");
      append(value, parts, el("span", "wrdn-reading-duration-caption", "今日累计"));
    }
    append(ring, svg, value);
    return ring;
  }

  renderReadingGoalControl() {
    const target = this.model.dailyGoal;
    const control = el("div", "wrdn-reading-goal-control");
    const trigger = el("button", "wrdn-reading-goal-trigger");
    trigger.type = "button";
    trigger.title = "点击编辑每日阅读目标";
    trigger.setAttribute("aria-expanded", "false");
    append(trigger, icon("target"), el("span", "", `目标 ${this.formatGoalDuration(target)}`), icon("edit", "wrdn-reading-goal-edit"));
    control.appendChild(trigger);
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const goal = control.closest(".wrdn-reading-time");
      if (!goal || goal.querySelector(".wrdn-reading-goal-editor")) return;
      trigger.setAttribute("aria-expanded", "true");
      const editor = el("div", "wrdn-reading-goal-editor");
      const head = el("div", "wrdn-reading-goal-editor-head");
      append(head, icon("target"), el("strong", "", "设置每日目标"));
      const presets = el("div", "wrdn-reading-goal-presets");
      const input = el("input", "wrdn-reading-goal-input");
      input.type = "number"; input.min = "5"; input.max = "1440"; input.step = "5"; input.value = String(target);
      const buttons = [15, 30, 45, 60].map((minutes) => {
        const button = el("button", "wrdn-reading-goal-chip", minutes === 60 ? "1 小时" : `${minutes} 分`);
        button.type = "button"; button.dataset.minutes = String(minutes);
        button.addEventListener("click", () => { input.value = String(minutes); paintPreset(); this.focusWithoutScroll(input); });
        presets.appendChild(button);
        return button;
      });
      const paintPreset = () => buttons.forEach((button) => button.classList.toggle("is-active", Number(button.dataset.minutes) === Math.round(Number(input.value) || 0)));
      const row = el("div", "wrdn-reading-goal-input-row");
      const minus = el("button", "wrdn-reading-goal-step", "−");
      const plus = el("button", "wrdn-reading-goal-step", "+");
      minus.type = plus.type = "button";
      const adjust = (delta) => { input.value = String(Math.min(1440, Math.max(5, Math.round(Number(input.value) || target) + delta))); paintPreset(); };
      minus.addEventListener("click", () => adjust(-5)); plus.addEventListener("click", () => adjust(5));
      append(row, minus, input, el("span", "wrdn-reading-goal-unit", "分钟"), plus);
      const actions = el("div", "wrdn-reading-goal-actions");
      const cancel = el("button", "wrdn-reading-goal-action secondary", "取消");
      const save = el("button", "wrdn-reading-goal-action primary", "保存");
      cancel.type = save.type = "button";
      const close = () => this.withStableViewport(() => { editor.remove(); goal.classList.remove("is-editing-goal"); trigger.setAttribute("aria-expanded", "false"); this.focusWithoutScroll(trigger); });
      cancel.addEventListener("click", close);
      save.addEventListener("click", async () => {
        const next = Math.round(Number(input.value) || 0);
        if (next < 5 || next > 1440) { input.setCustomValidity("请输入 5–1440 分钟"); input.reportValidity(); input.setCustomValidity(""); return; }
        save.disabled = true; save.textContent = "保存中…";
        clearInlineError(editor);
        const ok = await this.saveDashboardConfigField("daily_goal_minutes", next);
        if (!ok) {
          setInlineError(editor, "保存阅读目标失败，请重试。");
          save.disabled = false;
          save.textContent = "保存";
          return;
        }
        this.withStableViewport(() => {
          editor.remove();
          goal.classList.remove("is-editing-goal");
          goal.querySelector(".wrdn-reading-time-ring")?.replaceWith(this.renderReadingTimeRing());
          control.replaceWith(this.renderReadingGoalControl());
        });
      });
      input.addEventListener("input", paintPreset);
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") save.click(); if (event.key === "Escape") close(); });
      append(actions, cancel, save);
      append(editor, head, presets, row, actions);
      this.withStableViewport(() => { goal.classList.add("is-editing-goal"); goal.appendChild(editor); });
      paintPreset();
      requestAnimationFrame(() => this.focusWithoutScroll(input, true));
    });
    return control;
  }

  async saveDashboardConfigField(key, value) {
    const file = this.model.configFile || this.plugin.app.vault.getAbstractFileByPath(CONFIG_FILE);
    if (!file || !this.plugin.app.fileManager?.processFrontMatter) return false;
    try {
      await this.plugin.contentStore.runOwnWrite(file.path, () =>
        this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => { frontmatter[key] = value; })
      );
      this.model.config = { ...this.model.config, [key]: value };
      if (key === "daily_goal_minutes") this.model.dailyGoal = Math.min(1440, Math.max(5, Math.round(Number(value) || 30)));
      return true;
    } catch (error) {
      console.error("[Weread UI V2] 保存配置失败", error);
      return false;
    }
  }

  renderToday() {
    const section = this.panel("wrdn-today");
    section.appendChild(this.sectionHeader("今日阅读", null, "wrdn-today-heading"));
    const book = this.model.todayBook;
    const hasBook = Boolean(book?.id);
    const body = el("div", "wrdn-today-body");
    const coverWrap = this.actionNode(el("div", "wrdn-main-cover-wrap"), () => hasBook && this.plugin.navigation.openBook(book, "highlights", this.component.leaf), hasBook ? `打开《${book.title}》详情` : "暂无正在阅读书籍");
    coverWrap.appendChild(this.coverNode("wrdn-main-cover", book.cover, book.title));
    const info = el("div", "wrdn-book-info");
    append(info,
      this.actionNode(el("div", "wrdn-book-name", book.title || "暂无正在阅读书籍"), () => hasBook && this.plugin.navigation.openBook(book, "highlights", this.component.leaf), hasBook ? `打开《${book.title}》详情` : "暂无正在阅读书籍"),
      book.subtitle ? el("div", "wrdn-book-en", book.subtitle) : null,
      book.author ? el("div", "wrdn-book-author", book.author) : null,
      el("div", "wrdn-status-chip", hasBook ? computedBookStatus(book) : "—"),
      el("div", "wrdn-book-meta-rule"),
      el("div", "wrdn-current-label", "阅读进度")
    );
    const progressValue = Number.isFinite(Number(book.progress)) && book.progress !== null ? Math.min(100, Math.max(0, Number(book.progress))) : null;
    const current = el("div", "wrdn-current-num");
    current.innerHTML = progressValue === null ? "—" : `${Math.round(progressValue)}<span>%</span>`;
    info.appendChild(current);
    const progress = el("div", "wrdn-progress");
    const fill = el("i"); fill.style.width = `${progressValue ?? 0}%`; progress.appendChild(fill); info.appendChild(progress);
    const lastRead = formatDateZh(book.lastRead, true);
    info.appendChild(el("div", "wrdn-last-read", `上次阅读：${lastRead}`));
    const goal = el("div", "wrdn-goal wrdn-reading-time");
    goal.appendChild(this.renderReadingTimeRing());
    goal.appendChild(this.renderReadingGoalControl());
    const hasTodayReading = Math.max(0, Number(this.model.dataDays?.[this.model.todayKey]?.seconds || 0)) > 0;
    const label = hasTodayReading ? "继续阅读" : "开始阅读";
    const button = this.actionNode(el("button", "wrdn-primary", label), () => hasBook && this.openContinueReading(book, goal), label);
    button.type = "button"; button.disabled = !hasBook; goal.appendChild(button);
    append(body, coverWrap, info, el("div", "wrdn-today-rule"), goal); section.appendChild(body);
    return section;
  }

  async openContinueReading(book, feedbackContainer = null) {
    clearInlineError(feedbackContainer);
    const result = await openWereadReader(this.plugin, this.model.readingData, book);
    if (!result?.ok) setInlineError(feedbackContainer, result?.message || "无法打开微信读书。");
  }

  formatInspirationDate(date) {
    if (!date) return "时间未记录";
    const [year, month, day] = todayKeyShanghai(date).split("-");
    return `${year}年${month}月${day}日`;
  }

  renderInspiration() {
    const records = this.model.inspirationRecords;
    const section = this.panel("wrdn-inspiration");
    const shuffle = el("button", "wrdn-inspiration-shuffle"); shuffle.type = "button"; append(shuffle, el("span", "", "换一张"), icon("sync"));
    const header = this.sectionHeader("灵感回顾", shuffle, "wrdn-inspiration-header");
    const card = el("article", "wrdn-inspiration-card");
    const findIndex = () => records.findIndex((record) => record.key === this.session.inspirationKey);
    let currentIndex = findIndex();
    if (currentIndex < 0 && records.length) { currentIndex = Math.floor(Math.random() * records.length); this.session.inspirationKey = records[currentIndex].key; }
    const paint = () => {
      card.replaceChildren();
      const record = records[currentIndex];
      if (!record) { append(card, icon("quote", "wrdn-inspiration-mark"), el("p", "wrdn-inspiration-empty", "同步划线或想法后，这里会随机回顾一条内容。")); shuffle.disabled = true; return; }
      const thought = record.type === "thought";
      card.classList.toggle("is-thought", thought); card.classList.toggle("is-highlight", !thought);
      append(card, icon(thought ? "bulb" : "quote", "wrdn-inspiration-mark"), el("blockquote", "wrdn-inspiration-text", thought ? record.text : `“${record.text}”`));
      const meta = el("div", "wrdn-inspiration-meta");
      append(meta, el("div", "wrdn-inspiration-book", `《${record.book?.title ?? "未知书籍"}》`), el("div", "wrdn-inspiration-date", this.formatInspirationDate(record.created ?? record.book?.lastRead ?? null)));
      card.appendChild(meta);
    };
    shuffle.addEventListener("click", () => {
      if (records.length <= 1) currentIndex = records.length ? 0 : -1;
      else { let next = currentIndex; while (next === currentIndex) next = Math.floor(Math.random() * records.length); currentIndex = next; }
      this.session.inspirationKey = records[currentIndex]?.key ?? ""; paint();
    });
    paint(); append(section, header, card); return section;
  }

  innerCard(title, className = "") {
    const card = el("article", `wrdn-inner-card ${className}`.trim());
    card.appendChild(el("h3", "wrdn-inner-title", title));
    return card;
  }

  renderInsights() {
    const section = this.panel("wrdn-insights");
    const open = this.sectionLink("查看洞察", () => this.plugin.navigation.openKnowledge("content", {}, this.component.leaf), "打开知识中心");
    section.appendChild(this.sectionHeader("知识与洞察", open));
    const grid = el("div", "wrdn-insight-grid");
    const assets = this.innerCard("划线与想法", "wrdn-knowledge-assets-card");
    const metrics = el("div", "wrdn-asset-metrics");
    const metric = (iconName, label, value) => {
      const item = el("div", "wrdn-asset-metric");
      const iconWrap = el("div", "wrdn-asset-metric-icon"); iconWrap.appendChild(icon(iconName));
      const copy = el("div", "wrdn-asset-metric-copy"); const number = el("div", "wrdn-asset-metric-value"); number.innerHTML = `${value}<small>条</small>`;
      append(copy, el("div", "wrdn-asset-metric-label", label), number); append(item, iconWrap, copy); return item;
    };
    append(metrics, metric("quote", "读书划线", this.model.knowledgeHighlightsTotal), metric("bulb", "读书想法", this.model.knowledgeThoughtsTotal)); assets.appendChild(metrics);
    const sources = this.innerCard("内容主要来自", "wrdn-knowledge-sources-card");
    const list = el("div", "wrdn-source-book-list");
    for (const book of this.model.sourceBookDistribution) {
      const row = this.actionNode(el("div", "wrdn-source-book-row"), () => this.plugin.navigation.openBook(book, "highlights", this.component.leaf), `打开《${book.title}》`);
      append(row, el("span", "wrdn-source-book-name", book.title), el("strong", "", `${book.contentCount} 条`)); list.appendChild(row);
    }
    if (!this.model.sourceBookDistribution.length) list.appendChild(el("div", "wrdn-knowledge-empty", "暂无可统计的同步内容")); sources.appendChild(list);
    const fields = this.innerCard("阅读主题", "wrdn-reading-fields-card");
    const chips = el("div", "wrdn-reading-theme-chips");
    for (const item of this.model.readingFieldDistribution) {
      const chip = this.actionNode(el("div", "wrdn-reading-theme-chip"), () => this.plugin.navigation.openKnowledge("fields", { field: item.field }, this.component.leaf), `查看阅读主题：${item.field}`);
      append(chip, el("span", "", item.field), el("strong", "", item.books)); chips.appendChild(chip);
    }
    if (!this.model.readingFieldDistribution.length) chips.appendChild(el("div", "wrdn-knowledge-empty", "暂无阅读主题数据"));
    const network = el("div", "wrdn-reading-theme-network"); network.setAttribute("aria-hidden", "true");
    network.innerHTML = '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="50" cy="50" r="14"/><circle cx="50" cy="14" r="7"/><circle cx="84" cy="34" r="7"/><circle cx="79" cy="78" r="7"/><circle cx="50" cy="90" r="7"/><circle cx="18" cy="76" r="7"/><circle cx="14" cy="38" r="7"/><path d="M50 36V21M63 42l15-7M62 61l12 12M50 64v19M38 61 24 71M37 43 21 39"/></svg>';
    append(fields, chips, network); append(grid, assets, sources, fields); section.appendChild(grid); return section;
  }

  getMonthSnapshot() {
    const key = this.model.activeMonthKey;
    const fact = this.model.dataMonths?.[key] ?? null;
    const selected = this.model.logs.filter((row) => row.key.startsWith(`${key}-`));
    const activity = periodActivityStats(fact, selected);
    const sameMonth = (date) => date && todayKeyShanghai(date).startsWith(`${key}-`);
    return {
      fact,
      seconds: activity.totalSeconds,
      hours: activity.totalSeconds === null ? null : activity.totalSeconds / 3600,
      days: activity.readDays,
      highlights: Object.values(this.model.highlightEntities).filter((item) => sameMonth(recordCreatedDate(item))).length,
      thoughts: Object.values(this.model.thoughtEntities).filter((item) => sameMonth(recordCreatedDate(item))).length,
    };
  }

  getYearSnapshot() {
    const year = this.model.activeYear;
    const fact = this.model.dataYears?.[String(year)] ?? null;
    const selected = this.model.logs.filter((row) => row.key.startsWith(`${year}-`));
    const activity = periodActivityStats(fact, selected);
    return {
      fact,
      seconds: activity.totalSeconds,
      hours: activity.totalSeconds === null ? null : activity.totalSeconds / 3600,
      days: activity.readDays,
      highlights: Object.values(this.model.highlightEntities).filter((item) => recordCreatedDate(item) && todayKeyShanghai(recordCreatedDate(item)).startsWith(`${year}-`)).length,
      thoughts: Object.values(this.model.thoughtEntities).filter((item) => recordCreatedDate(item) && todayKeyShanghai(recordCreatedDate(item)).startsWith(`${year}-`)).length,
    };
  }

  getWeekSnapshot() {
    const key = this.model.activeWeekKey;
    const fact = this.model.readingData?.reading?.weeks?.[key] ?? null;
    const match = key.match(/^(\d{4})-W(\d{2})$/);
    let start = null;
    if (match) {
      const year = Number(match[1]); const week = Number(match[2]);
      const jan4 = new Date(Date.UTC(year, 0, 4)); const jan4Day = jan4.getUTCDay() || 7;
      start = new Date(Date.UTC(year, 0, 4 - jan4Day + 1 + (week - 1) * 7));
    }
    const naturalEnd = start ? new Date(start.getTime() + 6 * 86400000) : null;
    const todayKey = this.model.todayKey;
    const naturalEndKey = naturalEnd?.toISOString().slice(0, 10) ?? null;
    const endKey = naturalEndKey && key === this.model.activeWeekKey && todayKey < naturalEndKey ? todayKey : naturalEndKey;
    const end = endKey ? new Date(`${endKey}T00:00:00Z`) : null;
    const startKey = start?.toISOString().slice(0, 10) ?? null;
    const selected = startKey && endKey
      ? this.model.logs.filter((row) => row.key >= startKey && row.key <= endKey)
      : [];
    const activity = periodActivityStats(fact, selected);
    const inRange = (date) => date && startKey && endKey && todayKeyShanghai(date) >= startKey && todayKeyShanghai(date) <= endKey;
    return {
      seconds: activity.totalSeconds,
      hours: activity.totalSeconds === null ? null : activity.totalSeconds / 3600,
      days: activity.readDays,
      highlights: Object.values(this.model.highlightEntities).filter((item) => inRange(recordCreatedDate(item))).length,
      thoughts: Object.values(this.model.thoughtEntities).filter((item) => inRange(recordCreatedDate(item))).length,
      startKey,
      endKey,
      rangeLabel: start && end ? `${start.getUTCMonth() + 1}.${start.getUTCDate()} - ${end.getUTCMonth() + 1}.${end.getUTCDate()}` : "—",
    };
  }

  reviewFilePath(kind) {
    if (kind === "month") return `${REVIEW_FOLDER}/月/${this.model.activeMonthKey}.md`;
    if (kind === "year") return `${REVIEW_FOLDER}/年/${this.model.activeYear}.md`;
    return `${REVIEW_FOLDER}/周/${this.model.activeWeekKey}.md`;
  }

  async ensureReviewFile(kind) {
    const existingPath = this.reviewFilePath(kind);
    let file = this.plugin.app.vault.getAbstractFileByPath(existingPath);
    if (file) return file;
    const focusKey = reviewFocusKey(kind);
    const week = this.getWeekSnapshot();
    const meta = kind === "month" ? { period: "month", line: `month: ${this.model.activeMonthKey}`, title: `${Number(this.model.todayKey.slice(5, 7))} 月阅读回顾` }
      : kind === "year" ? { period: "year", line: `year: ${this.model.activeYear}`, title: `${this.model.activeYear} 年阅读回顾` }
      : { period: "week", line: `week: ${this.model.activeWeekKey}\nperiod: ${JSON.stringify(week.startKey && week.endKey ? `${week.startKey} — ${week.endKey}` : "")}`, title: `${this.model.activeWeekKey} 阅读回顾` };
    const yaml = ["---", "type: reading-review", `review_period: ${meta.period}`, meta.line, "valuable_insights: []", `${focusKey}: []`, 'personal_gain: ""', "---", "", `# ${meta.title}`, "", "本页内容可直接在阅读看板中填写。", ""].join("\n");
    await ensureUiVaultFolder(this.plugin.app, existingPath.split("/").slice(0, -1).join("/"));
    file = await this.plugin.app.vault.create(existingPath, yaml);
    return file;
  }

  async saveReviewField(kind, key, value) {
    const current = this.model.reviews[kind] ?? {};
    const expectedPath = normalizePath(this.reviewFilePath(kind));
    if (!this.plugin.app.fileManager?.processFrontMatter) return false;
    try {
      const file = await this.plugin.contentStore.runOwnWrite(expectedPath, async () => {
        const targetFile = await this.ensureReviewFile(kind);
        const periodId = kind === "week" ? this.model.activeWeekKey : kind === "month" ? this.model.activeMonthKey : String(this.model.activeYear);
        await this.plugin.app.fileManager.processFrontMatter(targetFile, (frontmatter) => {
          frontmatter.type = "reading-review";
          frontmatter.review_period = kind;
          if (kind === "week") frontmatter.week = periodId;
          else if (kind === "month") frontmatter.month = periodId;
          else frontmatter.year = Number(periodId);
          frontmatter[key] = value;
          frontmatter.updated_at = new Date().toISOString();
        });
        return targetFile;
      });
      this.model.reviews[kind] = {
        ...current,
        file: { path: file.path, name: file.basename },
        [key]: Array.isArray(value) ? [...value] : value,
      };
      return true;
    } catch (error) {
      console.error("[Weread UI V2] 保存阅读回顾失败", error);
      return false;
    }
  }

  stripChecklistPrefix(text) {
    return String(text ?? "").replace(/^[-*]\s*\[[ xX]?\]\s*/, "").replace(/^\[[ xX]?\]\s*/, "").trim();
  }

  isChecklistChecked(text) { return /^\s*(?:[-*]\s*)?\[[xX]\]\s*/.test(String(text ?? "")); }

  displayFocusItems(target, fieldKey) {
    return stringArray(target?.[fieldKey]).map((raw) => ({ raw, title: this.stripChecklistPrefix(raw), checked: this.isChecklistChecked(raw) })).filter((item) => item.title);
  }

  async toggleFocusItem(kind, fieldKey, values, index) {
    const next = [...values];
    const raw = String(next[index] ?? "").trim(); const base = this.stripChecklistPrefix(raw); if (!base) return;
    next[index] = `${this.isChecklistChecked(raw) ? "[ ]" : "[x]"} ${base}`;
    return this.saveReviewField(kind, fieldKey, next);
  }

  editorActions(onSave, onCancel) {
    const actions = el("div", "wrdn-inline-actions");
    const save = el("button", "wrdn-inline-save", "保存"); const cancel = el("button", "wrdn-inline-cancel", "取消"); save.type = cancel.type = "button";
    save.addEventListener("click", (event) => { event.stopPropagation(); onSave(); }); cancel.addEventListener("click", (event) => { event.stopPropagation(); onCancel(); });
    append(actions, save, cancel); return actions;
  }

  renderReviewPanel(kind, refreshPanel) {
    const body = el("div", "wrdn-review-body"); body.dataset.panel = kind;
    const target = this.model.reviews[kind] ?? {};
    const week = this.getWeekSnapshot(); const month = this.getMonthSnapshot(); const year = this.getYearSnapshot();
    const fmt = (value, digits = null) => value === null || value === undefined || !Number.isFinite(Number(value)) ? "-" : digits === null ? String(Number(value)) : Number(value).toFixed(digits).replace(/\.0$/, "");
    const copies = {
      week: { head: `本周回顾 <small>（${week.rangeLabel}）</small>`, metrics: [[durationMetricParts(week.seconds),"","阅读时长"],[fmt(week.days),"天","阅读天数"],[fmt(week.highlights),"条","划线"],[fmt(week.thoughts),"条","想法"]], gainTitle:"我的本周收获", gainPlaceholder:"点击填写本周的阅读收获", focusTitle:"下周阅读重点", focusKey:"next_week_focus" },
      month: { head: `${Number(this.model.todayKey.slice(5,7))} 月回顾`, metrics: [[durationMetricParts(month.seconds),"","阅读时长"],[fmt(month.days),"天","阅读天数"],[fmt(month.highlights),"条","划线"],[fmt(month.thoughts),"条","想法"]], gainTitle:"我的本月收获", gainPlaceholder:"点击填写本月的阅读收获", focusTitle:"下月阅读重点", focusKey:"next_month_focus" },
      year: { head: `${this.model.activeYear} 年回顾`, metrics: [[durationMetricParts(year.seconds),"","阅读时长"],[fmt(year.days),"天","阅读天数"],[fmt(year.highlights),"条","划线"],[fmt(year.thoughts),"条","想法"]], gainTitle:"我的年度收获", gainPlaceholder:"点击填写年度阅读收获", focusTitle:"下一年度阅读重点", focusKey:"next_year_focus" },
    };
    const copy = copies[kind];
    const periodId = kind === "week" ? this.model.activeWeekKey : kind === "month" ? this.model.activeMonthKey : String(this.model.activeYear);
    const draftPrefix = `home:review:${kind}:${periodId}:`;
    const gainDraftKey = `${draftPrefix}personal_gain`;
    const focusDraftKey = `${draftPrefix}${copy.focusKey}`;
    const finishDraft = (key) => { this.plugin.draftStore.clear(key); this.component.flushDeferredContentRefresh?.(); };

    const head = el("div", "wrdn-review-head"); head.innerHTML = copy.head; body.appendChild(head);
    const metrics = el("div", "wrdn-review-metrics");
    for (const [value, unit, label] of copy.metrics) {
      const item = el("div");
      const number = el("b");
      fillMetricNumber(number, value, unit, "span");
      append(item, number, el("small", "", label));
      metrics.appendChild(item);
    }
    body.appendChild(metrics);

    const gain = String(target.personal_gain ?? "").trim();
    const gainBox = el("div", "wrdn-note-box wrdn-review-gain-box wrdn-user-field");
    append(gainBox, el("b", "wrdn-note-box-title wrdn-review-field-title", copy.gainTitle), el("span", `wrdn-note-box-content wrdn-review-field-content${gain ? "" : " wrdn-empty-value"}`, gain || copy.gainPlaceholder));
    gainBox.setAttribute("role", "button"); gainBox.setAttribute("tabindex", "0");
    const editGain = (event) => {
      if (gainBox.dataset.editing === "true") return;
      event?.stopPropagation?.();
      gainBox.dataset.editing = "true";
      this.withStableViewport(() => {
        gainBox.replaceChildren();
        gainBox.classList.add("is-editing");
        gainBox.appendChild(el("b", "wrdn-note-box-title wrdn-review-field-title", copy.gainTitle));
      });
      const existingDraft = this.plugin.draftStore.get(gainDraftKey);
      const input = el("textarea", "wrdn-inline-input wrdn-inline-input-gain wrdn-review-field-content");
      input.rows = 3; input.placeholder = copy.gainPlaceholder; input.value = existingDraft?.value ?? gain;
      this.plugin.draftStore.begin(gainDraftKey, input.value);
      input.addEventListener("input", () => this.plugin.draftStore.update(gainDraftKey, input.value));
      gainBox.appendChild(input);
      gainBox.appendChild(this.editorActions(async () => {
        const value = input.value.trim();
        this.plugin.draftStore.update(gainDraftKey, value);
        clearInlineError(gainBox);
        if (await this.saveReviewField(kind, "personal_gain", value)) {
          finishDraft(gainDraftKey);
          refreshPanel?.();
        } else {
          setInlineError(gainBox, "保存失败，请重试。");
        }
      }, () => { finishDraft(gainDraftKey); refreshPanel?.(); }));
      requestAnimationFrame(() => this.focusWithoutScroll(input));
    };
    gainBox.addEventListener("click", editGain);
    gainBox.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") editGain(event); });
    body.appendChild(gainBox);
    if (this.plugin.draftStore.isEditing(gainDraftKey)) queueMicrotask(() => editGain());

    const focusItems = this.displayFocusItems(target, copy.focusKey);
    const rawValues = focusItems.map((item) => item.raw);
    const titleRow = el("div", "wrdn-review-subtitle-row"); titleRow.appendChild(el("div", "wrdn-review-subtitle wrdn-review-field-title", copy.focusTitle)); body.appendChild(titleRow);
    const focus = el("ul", "wrdn-focus-list wrdn-focus-checklist wrdn-review-field-content wrdn-user-field wrdn-focus-edit-surface");
    if (focusItems.length) {
      focusItems.forEach((entry, index) => {
        const item = el("li", `wrdn-focus-check-item${entry.checked ? " is-checked" : ""}`); const toggle = el("button", "wrdn-focus-check-toggle", entry.checked ? "✓" : ""); toggle.type = "button";
        toggle.addEventListener("click", async (event) => {
          event.stopPropagation();
          clearInlineError(focus);
          if (await this.toggleFocusItem(kind, copy.focusKey, rawValues, index)) refreshPanel?.();
          else setInlineError(focus, "保存失败，请重试。");
        });
        append(item, toggle, el("span", "wrdn-focus-checktext", entry.title)); focus.appendChild(item);
      });
    } else focus.appendChild(el("li", "wrdn-empty-value", `点击填写${copy.focusTitle}`));

    const editFocus = (event) => {
      if (focus.dataset.editing === "true") return;
      event?.stopPropagation?.();
      focus.dataset.editing = "true";
      this.withStableViewport(() => {
        focus.replaceChildren();
        focus.classList.add("is-editing");
      });
      const existingDraft = this.plugin.draftStore.get(focusDraftKey);
      const input = el("textarea", "wrdn-inline-input wrdn-inline-input-tall wrdn-review-field-content");
      input.rows = 3; input.placeholder = "每行填写一项计划，例如：每天阅读 30 分钟";
      input.value = existingDraft?.value ?? focusItems.map((item) => item.title).join("\n");
      this.plugin.draftStore.begin(focusDraftKey, input.value);
      input.addEventListener("input", () => this.plugin.draftStore.update(focusDraftKey, input.value));
      focus.appendChild(input);
      focus.appendChild(this.editorActions(async () => {
        const checked = new Map(focusItems.map((item) => [item.title, item.checked]));
        const next = input.value.split(/\n+/).map((item) => this.stripChecklistPrefix(item)).filter(Boolean).map((item) => checked.get(item) ? `[x] ${item}` : item);
        this.plugin.draftStore.update(focusDraftKey, input.value);
        clearInlineError(focus);
        if (await this.saveReviewField(kind, copy.focusKey, next)) {
          finishDraft(focusDraftKey);
          refreshPanel?.();
        } else {
          setInlineError(focus, "保存失败，请重试。");
        }
      }, () => { finishDraft(focusDraftKey); refreshPanel?.(); }));
      requestAnimationFrame(() => this.focusWithoutScroll(input));
    };
    focus.setAttribute("role", "button"); focus.setAttribute("tabindex", "0");
    focus.addEventListener("click", editFocus);
    focus.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") editFocus(event); });
    body.appendChild(focus);
    if (this.plugin.draftStore.isEditing(focusDraftKey)) queueMicrotask(() => editFocus());
    return body;
  }

  renderReview() {
    const section = this.panel("wrdn-review");
    const active = ["week","month","year"].includes(this.session.reviewPeriod) ? this.session.reviewPeriod : "week"; this.session.reviewPeriod = active;
    const open = this.sectionLink("查看回顾", () => this.plugin.navigation.openReview(this.session.reviewPeriod, this.component.leaf), "打开当前周期的回顾中心");
    section.appendChild(this.sectionHeader("阅读回顾与计划", open));
    const tabs = el("div", "wrdn-review-tabs"); const panels = el("div", "wrdn-review-panels");
    const panelNodes = new Map();
    const refreshPanel = (kind) => {
      const current = panelNodes.get(kind);
      if (!current) return;
      const next = this.renderReviewPanel(kind, () => refreshPanel(kind));
      next.hidden = current.hidden;
      this.withStableViewport(() => current.replaceWith(next));
      panelNodes.set(kind, next);
    };
    for (const [kind, label] of [["week","周回顾"],["month","月回顾"],["year","年回顾"]]) {
      const tab = el("button", `wrdn-tab${kind === active ? " is-active" : ""}`, label); tab.type = "button"; tab.dataset.review = kind;
      const panel = this.renderReviewPanel(kind, () => refreshPanel(kind)); panel.hidden = kind !== active; panelNodes.set(kind, panel);
      tab.addEventListener("click", () => { this.session.reviewPeriod = kind; tabs.querySelectorAll(".wrdn-tab").forEach((node) => node.classList.toggle("is-active", node === tab)); panelNodes.forEach((node, key) => { node.hidden = key !== kind; }); });
      tabs.appendChild(tab); panels.appendChild(panel);
    }
    append(section, tabs, panels); return section;
  }

  renderBookCard(book) {
    const card = this.actionNode(el("article", "wrdn-book-card"), () => this.plugin.navigation.openBook(book, "highlights", this.component.leaf), `打开《${book.title}》详情`);
    const top = el("div", "wrdn-book-top"); const content = el("div", "wrdn-book-card-content"); append(content, el("div", "wrdn-book-title", book.title));
    const line = el("div", "wrdn-book-progress-line"); const bar = el("span", "wrdn-book-progress"); const fill = el("i");
    const progress = book.progress !== null && Number.isFinite(Number(book.progress)) ? Math.min(100, Math.max(0, Number(book.progress))) : null; fill.style.width = `${progress ?? 0}%`; bar.appendChild(fill); append(line, el("b", "", progress === null ? "—" : `${Math.round(progress)}%`), bar); append(content, line); append(top, this.coverNode("wrdn-book-cover", book.cover, book.title), content);
    const foot = el("div", "wrdn-book-foot"); const status = computedBookStatus(book); foot.innerHTML = `${Math.max(0, book.highlights) + Math.max(0, book.thoughts)} 条笔记<br>上次：${relativeDayLabel(book.lastRead)}<br>`; foot.appendChild(el("span", `wrdn-book-badge${status === "已读完" ? " done" : ""}`, status)); append(card, top, foot); return card;
  }

  shelfBooks(mode) {
    if (mode === "done") return this.model.orderedBooks.filter((book) => computedBookStatus(book) === "已读完");
    if (mode === "all") return this.model.orderedBooks;
    return this.model.orderedBooks.filter((book) => computedBookStatus(book) === "正在阅读");
  }

  renderShelf() {
    const section = this.panel("wrdn-shelf"); const filters = el("div", "wrdn-filter-row"); const row = el("div", "wrdn-book-row");
    const open = this.sectionLink("全部书架", () => this.plugin.navigation.openShelf(this.component.leaf), "打开完整书架");
    const header = this.sectionHeader("我的书架", open);
    header.insertBefore(filters, open);
    section.appendChild(header);
    const active = ["reading","done","all"].includes(this.session.shelfFilter) ? this.session.shelfFilter : "reading"; this.session.shelfFilter = active;
    const show = (mode) => {
      this.session.shelfFilter = mode; row.replaceChildren(); const visible = this.shelfBooks(mode).slice(0, 6); visible.forEach((book) => row.appendChild(this.renderBookCard(book)));
      if (!visible.length) { const empty = el("div", "wrdn-knowledge-empty wrdn-empty-value wrdn-book-row-empty", mode === "reading" ? "暂无正在阅读的书籍，完成首次同步后将在这里显示。" : mode === "done" ? "暂无已读完书籍。" : "书架数据尚未同步。"); row.appendChild(empty); }
      filters.querySelectorAll(".wrdn-filter").forEach((node) => node.classList.toggle("is-active", node.dataset.filter === mode));
    };
    for (const [mode, label] of [["reading",`正在阅读 ${this.shelfBooks("reading").length}`],["done",`已读完 ${this.shelfBooks("done").length}`],["all",`全部 ${this.shelfBooks("all").length}`]]) { const button = el("button", `wrdn-filter${mode === active ? " is-active" : ""}`, label); button.type = "button"; button.dataset.filter = mode; button.addEventListener("click", () => show(mode)); filters.appendChild(button); }
    show(active); section.appendChild(row); return section;
  }

  heatLevel(minutes, max) { if (!(minutes > 0)) return 0; const ratio = minutes / Math.max(max, 1); return ratio > .8 ? 4 : ratio > .55 ? 3 : ratio > .3 ? 2 : 1; }

  renderHeatmap() {
    const card = el("article", "wrdn-chart wrdn-heat"); card.appendChild(el("h3", "wrdn-chart-title", "阅读热力图"));
    const fact = this.model.dataMonths?.[this.model.activeMonthKey] ?? null; const activity = periodActivityStats(fact); const [year, month] = this.model.activeMonthKey.split("-").map(Number); const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate(); const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); const offset = (firstWeekday + 6) % 7; const todayDay = Number(this.model.todayKey.slice(8,10)); const daily = activity.dailySeconds; const values = Object.values(daily).map((value) => Number(value) / 60); const max = Math.max(...values, 1);
    const months = el("div", "wrdn-months"); months.appendChild(el("span", "", `${month}月`)); const weekdays = el("div", "wrdn-weekdays"); ["周一","周二","周三","周四","周五","周六","周日"].forEach((day) => weekdays.appendChild(el("span", "", day))); const grid = el("div", "wrdn-heat-grid");
    const tooltip = el("div", "wrdn-heat-tooltip");
    tooltip.hidden = true;
    Object.assign(tooltip.style, {
      position: "absolute",
      zIndex: "30",
      maxWidth: "calc(100% - 12px)",
      padding: "6px 9px",
      border: "1px solid var(--wrdn-border-strong, #e4d9ce)",
      borderRadius: "6px",
      background: "var(--wrdn-card, #fffdfa)",
      color: "var(--wrdn-text, #24211f)",
      boxShadow: "0 5px 18px rgba(75, 54, 35, 0.12)",
      fontSize: "9px",
      lineHeight: "1.45",
      whiteSpace: "nowrap",
      pointerEvents: "none"
    });
    const positionHeatTooltip = (cell) => {
      const cardRect = card.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      let left = cellRect.left - cardRect.left + (cellRect.width - tooltipRect.width) / 2;
      left = Math.max(6, Math.min(left, cardRect.width - tooltipRect.width - 6));
      let top = cellRect.top - cardRect.top - tooltipRect.height - 7;
      if (top < 34) top = cellRect.bottom - cardRect.top + 7;
      tooltip.style.left = `${Math.round(left)}px`;
      tooltip.style.top = `${Math.round(top)}px`;
    };
    const showHeatTooltip = (cell, label) => {
      tooltip.textContent = label;
      tooltip.hidden = false;
      positionHeatTooltip(cell);
    };
    const hideHeatTooltip = () => { tooltip.hidden = true; };
    for (let i=0;i<offset;i++) { const spacer=el("div","wrdn-heat-cell level-0 is-spacer"); grid.appendChild(spacer); }
    const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    for (let day=1;day<=daysInMonth;day++) {
      const key=`${this.model.activeMonthKey}-${String(day).padStart(2,"0")}`;
      const covered=Object.prototype.hasOwnProperty.call(daily,key);
      const seconds=covered?Math.max(0,Number(daily[key])||0):null;
      const minutes=seconds===null?0:seconds/60;
      const isFuture=day>todayDay;
      const weekday=weekdayLabels[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] || "";
      const cell=el("div",`wrdn-heat-cell level-${covered&&seconds>0?this.heatLevel(minutes,max):0}${isFuture?" is-future":""}${day===todayDay?" is-today":""}`);
      const detail=isFuture?"未来日期":!covered?"数据未覆盖":`阅读 ${exactDurationZh(seconds)}`;
      const label=`${month}月${day}日 · ${weekday} · ${detail}`;
      cell.setAttribute("aria-label", label);
      cell.addEventListener("mouseenter", () => showHeatTooltip(cell, label));
      cell.addEventListener("mouseleave", hideHeatTooltip);
      grid.appendChild(cell);
    }
    const legend=el("div","wrdn-heat-legend"); legend.appendChild(el("span","","少")); for(let i=0;i<5;i++)legend.appendChild(el("i",`level-${i}`)); legend.appendChild(el("span","","多")); const meta=el("div","wrdn-heat-meta"); const snap=this.getMonthSnapshot(); append(meta,el("span","",`阅读：${snap.days??"—"} 天`)); append(card,months,weekdays,grid,legend,meta,tooltip); return card;
  }

  renderTrend() {
    const card = el("article", "wrdn-chart wrdn-trend");
    card.appendChild(el("h3", "wrdn-chart-title", "阅读时长趋势"));
    const fact = this.model.dataMonths?.[this.model.activeMonthKey] ?? null;
    const activity = periodActivityStats(fact);
    const daily = activity.dailySeconds;
    const month = Number(this.model.activeMonthKey.slice(5, 7)) || 1;
    const todayDay = Number(this.model.todayKey.slice(8, 10));
    const data = Array.from({ length: Math.max(1, todayDay) }, (_, index) => {
      const day = index + 1;
      const key = `${this.model.activeMonthKey}-${String(day).padStart(2, "0")}`;
      const seconds = Math.max(0, Number(daily[key] ?? 0));
      return { day, seconds, minutes: seconds / 60, covered: Object.prototype.hasOwnProperty.call(daily, key) };
    });
    const width = 300, height = 150, left = 28, right = 8, top = 10, bottom = 24;
    const rawMax = Math.max(0, ...data.map((item) => item.minutes));
    const max = Math.max(10, Math.ceil(rawMax / 10) * 10);
    const points = data.map((item, index) => ({
      item,
      x: left + index * ((width - left - right) / Math.max(data.length - 1, 1)),
      y: top + (height - top - bottom) * (1 - item.minutes / max),
    }));
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.classList.add("wrdn-trend-svg");
    const mid = Math.round(max / 2);
    let labelDays = todayDay <= 7
      ? data.map((item) => item.day)
      : todayDay <= 15
        ? [...new Set([1, Math.ceil(todayDay / 5), Math.ceil(todayDay * 2 / 5), Math.ceil(todayDay * 3 / 5), Math.ceil(todayDay * 4 / 5), todayDay])]
        : [...new Set([1, 5, 10, 15, 20, 25, todayDay])].filter((day) => day <= todayDay);
    if (labelDays.length > 1) {
      const previousLabel = labelDays[labelDays.length - 2];
      if (todayDay - previousLabel < 3 && previousLabel !== 1) labelDays = labelDays.filter((day) => day !== previousLabel);
    }
    const xLabels = labelDays.map((day) => {
      const point = points[day - 1];
      const anchor = day === 1 ? "start" : day === todayDay ? "end" : "middle";
      return `<text x="${point?.x ?? left}" y="144" text-anchor="${anchor}">${month}/${day}</text>`;
    }).join("");
    const pathD = points.map((p, index) => `${index ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const areaId = `wrdnV2Area-${this.component.instanceId.replace(/[^a-zA-Z0-9]/g, "")}`;
    svg.innerHTML = `<defs><linearGradient id="${areaId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c69a69" stop-opacity=".26"/><stop offset="1" stop-color="#c69a69" stop-opacity="0"/></linearGradient></defs><g class="wrdn-grid-lines"><line x1="28" y1="126" x2="292" y2="126"/><line x1="28" y1="68" x2="292" y2="68"/><line x1="28" y1="10" x2="292" y2="10"/></g><g class="wrdn-axis-labels"><text x="5" y="130">0</text><text x="5" y="72">${mid}</text><text x="5" y="14">${max}</text>${xLabels}</g><path d="${pathD} L ${points[points.length - 1]?.x ?? left} ${height - bottom} L ${points[0]?.x ?? left} ${height - bottom} Z" fill="url(#${areaId})"/><path d="${pathD}" class="wrdn-line-path"/>`;
    for (const point of points) {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(point.x));
      circle.setAttribute("cy", String(point.y));
      circle.setAttribute("r", data.length > 20 ? "1.8" : "2.6");
      circle.classList.add("wrdn-trend-dot");
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `${month}月${point.item.day}日 · ${point.item.covered ? exactDurationZh(point.item.seconds) : "数据未覆盖"}`;
      circle.appendChild(title);
      svg.appendChild(circle);
    }
    const totalSeconds = activity.totalSeconds;
    const totalText = totalSeconds === null ? "—" : exactDurationZh(totalSeconds);
    append(card, svg, el("div", "wrdn-trend-note", `累计 ${totalText}`));
    return card;
  }

  renderTimeDistribution() {
    const fact = this.model.dataOverall ?? null;
    const card = el("article", "wrdn-chart wrdn-time wrdn-time-chart");
    const titleRow = el("div", "wrdn-chart-title-row wrdn-time-title-row");
    titleRow.appendChild(el("h3", "wrdn-chart-title", "阅读时段分布"));
    const help = el("span", "wrdn-help");
    const button = el("button", "wrdn-help-button", "?");
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    const tooltip = el("span", "wrdn-help-tooltip");
    tooltip.setAttribute("role", "tooltip");
    const bands = [
      { name: "凌晨", range: "00:00–06:00", start: 0, end: 6 },
      { name: "上午", range: "06:00–12:00", start: 6, end: 12 },
      { name: "下午", range: "12:00–18:00", start: 12, end: 18 },
      { name: "晚上", range: "18:00–24:00", start: 18, end: 24 },
    ];
    append(tooltip,
      el("b", "", "数据范围"),
      el("span", "", "微信读书历史阅读时段"),
      el("b", "", "时段定义"),
      ...bands.map((band) => el("span", "", `${band.name} ${band.range}`))
    );
    button.addEventListener("click", () => {
      const open = help.classList.toggle("is-open");
      button.setAttribute("aria-expanded", String(open));
    });
    append(help, button, tooltip);
    append(titleRow, help);
    card.appendChild(titleRow);

    const rawPrefer = Array.isArray(fact?.preferTimeSeconds) && fact.preferTimeSeconds.length === 24
      ? fact.preferTimeSeconds.map((value) => Math.max(0, Number(value) || 0))
      : null;
    // overall.preferTime is already a real 24-hour distribution. Keep its real seconds;
    // do not rescale it to totalReadTime because the two API totals can use different coverage rules.
    const prefer = rawPrefer;
    const values = bands.map((band) => ({
      ...band,
      seconds: prefer ? prefer.slice(band.start, band.end).reduce((a, b) => a + b, 0) : null,
    }));
    const totalRawSeconds = prefer ? prefer.reduce((a, b) => a + b, 0) : null;
    const totalSeconds = totalRawSeconds && totalRawSeconds > 0 ? totalRawSeconds : 1;
    const percentages = roundedPercentages(values.map((item) => item.seconds ?? 0));
    const colors = ["#7567a8", "#58a473", "#6f91c6", "#3f6fa7"];
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("wrdn-time-svg");
    svg.setAttribute("viewBox", "0 0 240 144");
    const ns = "http://www.w3.org/2000/svg", cx = 66, cy = 68, radius = 43, strokeWidth = 20, circ = 2 * Math.PI * radius;
    let acc = 0;
    values.forEach((item, index) => {
      const fraction = item.seconds === null ? 0 : Number(item.seconds) / totalSeconds;
      const circle = document.createElementNS(ns, "circle");
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", cy);
      circle.setAttribute("r", radius);
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke", colors[index]);
      circle.setAttribute("stroke-width", strokeWidth);
      circle.setAttribute("stroke-dasharray", `${(fraction * circ).toFixed(3)} ${(circ - fraction * circ).toFixed(3)}`);
      circle.setAttribute("stroke-dashoffset", `${(-acc * circ).toFixed(3)}`);
      circle.setAttribute("transform", `rotate(-90 ${cx} ${cy})`);
      svg.appendChild(circle);
      acc += fraction;
    });
    const ys = [24, 50, 76, 102];
    values.forEach((item, index) => {
      const y = ys[index];
      const dot = document.createElementNS(ns, "circle");
      dot.setAttribute("cx", "139"); dot.setAttribute("cy", String(y - 3)); dot.setAttribute("r", "3.6"); dot.setAttribute("fill", colors[index]); svg.appendChild(dot);
      const name = document.createElementNS(ns, "text");
      name.setAttribute("x", "148"); name.setAttribute("y", String(y)); name.setAttribute("class", "wrdn-time-legend-name"); name.textContent = item.name; svg.appendChild(name);
      const value = document.createElementNS(ns, "text");
      value.setAttribute("x", "170"); value.setAttribute("y", String(y)); value.setAttribute("class", "wrdn-time-legend-value");
      if (item.seconds === null) value.textContent = "—";
      else {
        value.textContent = `${formatHoursMinutes(item.seconds)} (${percentages[index]}%)`;
      }
      svg.appendChild(value);
    });
    const dominant = totalRawSeconds && totalRawSeconds > 0
      ? values.reduce((best, item) => Number(item.seconds) > Number(best.seconds) ? item : best, values[0])
      : null;
    const rhythm = el("div", "wrdn-time-total");
    if (dominant) {
      append(rhythm, document.createTextNode("常常在"), el("strong", "", `${dominant.name}（${dominant.range}）`), document.createTextNode("阅读"));
    } else {
      rhythm.textContent = "暂无阅读时段数据";
    }
    append(card, svg, rhythm);
    return card;
  }

  renderRhythm() {
    const section=this.panel("wrdn-rhythm"); section.appendChild(this.sectionHeader("阅读节奏")); const grid=el("div","wrdn-chart-grid"); append(grid,this.renderHeatmap(),this.renderTrend(),this.renderTimeDistribution()); const footer=el("div","wrdn-footer"); const left=el("span","wrdn-footer-left"); append(left,icon("lamp"),el("span","","小贴士：保持每周回顾的习惯，会让阅读真正产生价值。")); append(footer,left); append(section,grid,footer); return section;
  }
}


const REVIEW_HISTORY_STYLE = `
.wrdn-page.wrdn-rc-page.is-history-mode { height: auto; min-height: 0; max-height: none; grid-template-rows: 34px 52px auto; overflow: visible; }
.wrdn-rc-workspace.is-history { grid-template-columns: minmax(0, 1fr); min-height: 0; overflow: visible; }
.wrdn-rc-workspace.is-history .wrdn-rc-sidebar { display: none !important; }
.wrdn-rc-workspace.is-history .wrdn-rc-detail { min-height: 0; overflow: visible; }
.wrdn-rc-history { display: grid; width: 100%; min-width: 0; min-height: 0; gap: 14px; padding-right: 2px; align-content: start; grid-auto-rows: max-content; }
.wrdn-rc-history-card { min-width: 0; border: 1px solid var(--line); border-radius: 17px; background: var(--panel); padding: 18px 20px; }
.wrdn-rc-history-heading { display: flex; min-width: 0; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0 0 14px; }
.wrdn-rc-history-title { margin: 0; color: #28231f; font-size: 17px; line-height: 24px; }
.wrdn-rc-history-summary { display: inline-flex; height: 24px; align-items: center; padding: 0 10px; border-radius: 999px; background: var(--soft); color: #66584d; font-size: 12px; font-weight: 650; line-height: 1; white-space: nowrap; }
.wrdn-rc-history-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
.wrdn-rc-history-metric { display: grid; min-width: 0; min-height: 86px; align-content: center; gap: 8px; padding: 14px 16px; border: 1px solid color-mix(in srgb, var(--line) 82%, transparent); border-radius: 14px; background: color-mix(in srgb, var(--soft) 46%, var(--panel)); }
.wrdn-rc-history-metric > span { color: var(--muted); font-size: 12px; font-weight: 550; }
.wrdn-rc-history-metric strong { color: #2d2925; font-size: 25px; line-height: 1; letter-spacing: -.01em; }
.wrdn-rc-history-metric strong small { margin-left: 4px; color: var(--muted); font-size: 11px; font-weight: 600; }
.wrdn-rc-history-chart { min-width: 0; padding: 4px 2px 0; }
.wrdn-rc-history-rows { display: grid; gap: 14px; }
.wrdn-rc-history-year-row { display: grid; grid-template-columns: 52px minmax(0, 1fr) 70px; align-items: center; column-gap: 18px; min-width: 0; min-height: 22px; }
.wrdn-rc-history-year-label { color: #6d6259; font-size: 13px; font-weight: 650; line-height: 1; white-space: nowrap; }
.wrdn-rc-history-bar-slot { display: flex; align-items: center; min-width: 0; height: 10px; }
.wrdn-rc-history-bar { display: block; height: 8px; min-width: 6px; border-radius: 999px; background: var(--brown); opacity: .68; }
.wrdn-rc-history-year-value { color: #786d64; font-size: 12px; font-weight: 650; line-height: 1; text-align: right; white-space: nowrap; }
.wrdn-rc-history-empty { padding: 24px 12px; color: var(--muted); text-align: center; }
@container wrdn-review-center-v2 (max-width: 670px) {
  .wrdn-rc-history-card { padding: 14px; }
  .wrdn-rc-history-metric { min-height: 72px; padding: 12px 13px; }
  .wrdn-rc-history-metric strong { font-size: 21px; }
}
@container wrdn-review-center-v2 (max-width: 540px) {
  .wrdn-rc-history-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .wrdn-rc-history-summary { height: 22px; padding: 0 9px; }
  .wrdn-rc-history-year-row { grid-template-columns: 44px minmax(0, 1fr) 58px; column-gap: 10px; }
  .wrdn-rc-history-rows { gap: 12px; }
  .wrdn-rc-history-year-label { font-size: 12px; }
  .wrdn-rc-history-year-value { font-size: 11px; }
}
`;

class ReviewCenterRenderer {
  constructor(plugin, component, model, session) {
    this.plugin = plugin;
    this.component = component;
    this.model = model;
    this.session = session;
    this.kind = ["week", "month", "year", "history"].includes(session.activePeriod) ? session.activePeriod : "week";
    this.selectedByKind = { week: "", month: "", year: "", ...(session.selectedByKind ?? {}) };
    this.root = null;
    this.tabs = null;
    this.count = null;
    this.sidebar = null;
    this.detail = null;
  }

  render() {
    const root = el("main", "wrdn-page wrdn-rc-page");
    this.root = root;

    const backRow = el("header", "wrdn-rc-back-row");
    const back = el("button", "wrdn-p-back");
    back.type = "button";
    append(back, pageIcon("back"), el("span", "", "返回阅读看板"));
    back.addEventListener("click", () => void this.plugin.navigation.openHome(this.component.leaf));
    backRow.appendChild(back);

    const toolbar = el("div", "wrdn-rc-toolbar");
    this.tabs = el("div", "wrdn-rc-tabs");
    this.count = el("span", "wrdn-rc-count");
    append(toolbar, this.tabs, this.count);

    const workspace = el("div", "wrdn-rc-workspace");
    this.sidebar = el("aside", "wrdn-rc-sidebar");
    this.detail = el("section", "wrdn-rc-detail");
    append(workspace, this.sidebar, this.detail);
    append(root, backRow, toolbar, workspace);

    for (const [value, label] of [["week", "周回顾"], ["month", "月回顾"], ["year", "年回顾"], ["history", "历史"]]) {
      const button = el("button", "wrdn-rc-tab", label);
      button.type = "button";
      button.dataset.kind = value;
      button.addEventListener("click", () => {
        if (this.kind === value) return;
        this.kind = value;
        this.session.activePeriod = value;
        this.renderCurrent();
      });
      this.tabs.appendChild(button);
    }
    this.renderCurrent();
    return root;
  }

  rowsForKind() {
    return this.model.reviews
      .filter((page) => reviewKindOf(page) === this.kind)
      .sort((a, b) => reviewSortStamp(b).localeCompare(reviewSortStamp(a), "zh-CN"));
  }

  selectedPage(rows) {
    const selected = String(this.selectedByKind[this.kind] ?? "");
    return rows.find((page) => page.file?.path === selected) ?? rows[0] ?? null;
  }

  renderCurrent() {
    this.tabs?.querySelectorAll("button").forEach((button) => button.classList.toggle("is-active", button.dataset.kind === this.kind));
    this.session.activePeriod = this.kind;
    this.session.selectedByKind = { ...this.selectedByKind };
    this.root?.classList.toggle("is-history-mode", this.kind === "history");
    if (this.kind === "history") {
      this.count.textContent = "";
      this.count.hidden = true;
      this.sidebar.replaceChildren();
      this.sidebar.hidden = true;
      this.root?.querySelector(".wrdn-rc-workspace")?.classList.add("is-history");
      this.renderHistory();
      return;
    }
    this.count.textContent = "";
    this.count.hidden = true;
    this.sidebar.hidden = false;
    this.root?.querySelector(".wrdn-rc-workspace")?.classList.remove("is-history");
    const rows = this.rowsForKind();
    const selected = this.selectedPage(rows);
    if (selected?.file?.path) this.selectedByKind[this.kind] = selected.file.path;
    this.renderSidebar(rows, selected);
    this.renderDetail(selected);
  }

  renderHistory() {
    this.detail.replaceChildren();
    const panel = el("section", "wrdn-rc-history");
    const metricsCard = el("article", "wrdn-rc-history-card");
    metricsCard.appendChild(el("h2", "wrdn-rc-history-title", "累计阅读"));
    const metrics = el("div", "wrdn-rc-history-metrics");
    for (const [value, unit, label] of historyMetricValues(this.model)) {
      const item = el("div", "wrdn-rc-history-metric");
      const number = el("strong");
      fillMetricNumber(number, value, unit);
      append(item, el("span", "", label), number);
      metrics.appendChild(item);
    }
    metricsCard.appendChild(metrics);

    const trendCard = el("article", "wrdn-rc-history-card");
    const rows = historyYearRows(this.model.readingData);
    const heading = el("div", "wrdn-rc-history-heading");
    heading.appendChild(el("h2", "wrdn-rc-history-title", "年度阅读趋势"));
    const maxRow = rows.length ? rows.reduce((best, row) => row.seconds > best.seconds ? row : best, rows[0]) : null;
    if (maxRow) heading.appendChild(el("span", "wrdn-rc-history-summary", `${maxRow.year} 年阅读最久 · ${historyDurationLongLabel(maxRow.seconds)}`));
    trendCard.appendChild(heading);
    if (!rows.length) {
      trendCard.appendChild(el("div", "wrdn-rc-history-empty", "暂无年度阅读统计。完成历史数据同步后将在这里显示。"));
    } else {
      const chart = el("div", "wrdn-rc-history-chart");
      const yearRows = el("div", "wrdn-rc-history-rows");
      const maxSeconds = Math.max(1, ...rows.map((row) => row.seconds));
      chart.setAttribute("role", "img");
      chart.setAttribute("aria-label", rows.map((row) => `${row.year} 年 ${historyHoursLabel(row.seconds)}`).join("；"));
      for (const row of rows) {
        const item = el("div", "wrdn-rc-history-year-row");
        const slot = el("div", "wrdn-rc-history-bar-slot");
        const bar = el("i", "wrdn-rc-history-bar");
        bar.style.width = `${Math.max(1.5, row.seconds / maxSeconds * 100).toFixed(1)}%`;
        bar.title = `${row.year} 年 · ${historyDurationLongLabel(row.seconds)}`;
        slot.appendChild(bar);
        append(item, el("span", "wrdn-rc-history-year-label", row.year), slot, el("span", "wrdn-rc-history-year-value", historyHoursLabel(row.seconds)));
        yearRows.appendChild(item);
      }
      chart.appendChild(yearRows);
      trendCard.appendChild(chart);
    }
    append(panel, metricsCard, trendCard);
    this.detail.appendChild(panel);
  }

  renderSidebar(rows, selected) {
    this.sidebar.replaceChildren();
    if (!rows.length) {
      this.sidebar.appendChild(el("div", "wrdn-rc-empty", "暂无这个周期的历史统计。请先执行一次完整同步建立历史数据。"));
      return;
    }
    const list = el("div", "wrdn-rc-list");
    for (const page of rows) {
      const active = selected?.file?.path === page.file?.path;
      const button = el("button", `wrdn-rc-period${active ? " is-active" : ""}`);
      button.type = "button";
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.addEventListener("click", () => {
        if (active) return;
        this.selectedByKind[this.kind] = page.file.path;
        this.session.selectedByKind = { ...this.selectedByKind };
        this.renderCurrent();
      });
      const copy = el("span", "wrdn-rc-period-copy");
      copy.appendChild(el("strong", "", reviewListTitle(page)));
      if (active) copy.appendChild(el("small", "", reviewRangeText(page)));
      append(button, copy, active ? el("span", "wrdn-rc-period-state", "✓") : el("span", "wrdn-rc-period-chevron", "⌄"));
      list.appendChild(button);
    }
    this.sidebar.appendChild(list);
  }

  renderMetrics(page) {
    const grid = el("div", "wrdn-rc-metrics");
    for (const [value, unit, label] of reviewMetricValues(this.model, page)) {
      const item = el("div", "wrdn-rc-metric");
      const number = el("strong");
      fillMetricNumber(number, value, unit);
      append(item, number, el("span", "", label));
      grid.appendChild(item);
    }
    return grid;
  }

  gainOf(page) { return String(page?.personal_gain ?? "").trim(); }

  cleanFocusText(value) {
    const raw = String(value ?? "").trim();
    const cleaned = raw.replace(/^[-*]\s*\[[ xX]?\]\s*/, "").replace(/^\[[ xX]?\]\s*/, "").trim();
    const wiki = cleaned.match(/^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/);
    const path = wiki?.[1]?.trim() ?? cleaned;
    return String(wiki?.[2]?.trim() || path.split("/").pop()?.replace(/\.md$/i, "") || path).replace(/^[【\[]+|[】\]]+$/g, "").trim();
  }

  focusItemsOf(page) {
    return stringArray(page?.[reviewFocusKey(reviewKindOf(page))]).map((value) => {
      const raw = String(value ?? "").trim();
      return { raw, title: this.cleanFocusText(raw), checked: /^\s*(?:[-*]\s*)?\[[xX]\]\s*/.test(raw) };
    }).filter((item) => item.title);
  }

  draftKey(page, field) { return `review-center:${normalizePath(String(page?.file?.path ?? ""))}:${field}`; }

  editorActions(onSave, onCancel) {
    const actions = el("div", "wrdn-rc-editor-actions");
    const cancel = el("button", "wrdn-rc-editor-button is-secondary", "取消");
    const save = el("button", "wrdn-rc-editor-button is-primary", "保存");
    cancel.type = save.type = "button";
    cancel.addEventListener("click", onCancel);
    save.addEventListener("click", onSave);
    append(actions, cancel, save);
    return actions;
  }

  focusWithoutScroll(input) {
    const scroller = this.component.contentEl;
    const top = scroller?.scrollTop ?? 0;
    try { input.focus({ preventScroll: true }); }
    catch {}
    if (typeof input.setSelectionRange === "function") input.setSelectionRange(input.value.length, input.value.length);
    if (scroller) scroller.scrollTop = top;
    requestAnimationFrame(() => { if (scroller) scroller.scrollTop = top; });
  }

  openGainEditor(page, section, content) {
    if (section.classList.contains("is-editing")) return;
    section.classList.add("is-editing");
    const key = this.draftKey(page, "gain");
    const draft = this.plugin.draftStore.get(key);
    const editor = el("div", "wrdn-rc-editor wrdn-rc-gain-editor");
    const input = el("textarea", "wrdn-rc-editor-input");
    input.value = draft?.editing ? draft.value : this.gainOf(page);
    input.placeholder = "写下这个周期最重要的收获";
    this.plugin.draftStore.begin(key, input.value);
    input.addEventListener("input", () => this.plugin.draftStore.update(key, input.value));
    const cancel = () => {
      this.plugin.draftStore.clear(key);
      this.renderDetail(page);
      this.component.flushDeferredRefresh();
    };
    const save = async () => {
      const value = input.value.trim();
      clearInlineError(editor);
      if (!await this.saveValue(page, "personal_gain", value)) {
        setInlineError(editor, "保存失败，请重试。");
        return;
      }
      this.plugin.draftStore.clear(key);
      page.personal_gain = value;
      this.renderDetail(page);
      this.component.flushDeferredRefresh();
    };
    append(editor, input, this.editorActions(save, cancel));
    content.replaceWith(editor);
    this.focusWithoutScroll(input);
  }

  openFocusEditor(page, section, content) {
    if (section.classList.contains("is-editing")) return;
    section.classList.add("is-editing");
    const existing = this.focusItemsOf(page);
    const key = this.draftKey(page, "focus");
    const draft = this.plugin.draftStore.get(key);
    const editor = el("div", "wrdn-rc-editor wrdn-rc-focus-editor");
    const input = el("textarea", "wrdn-rc-editor-input");
    input.value = draft?.editing ? draft.value : existing.map((item) => item.title).join("\n");
    input.placeholder = "每行填写一项计划，例如：每天阅读 30 分钟";
    this.plugin.draftStore.begin(key, input.value);
    input.addEventListener("input", () => this.plugin.draftStore.update(key, input.value));
    const cancel = () => {
      this.plugin.draftStore.clear(key);
      this.renderDetail(page);
      this.component.flushDeferredRefresh();
    };
    const save = async () => {
      const checked = new Map(existing.map((item) => [item.title, item.checked]));
      const values = input.value.split(/\n+/).map((line) => this.cleanFocusText(line)).filter(Boolean).map((line) => checked.get(line) ? `[x] ${line}` : line);
      const field = reviewFocusKey(reviewKindOf(page));
      clearInlineError(editor);
      if (!await this.saveValue(page, field, values)) {
        setInlineError(editor, "保存失败，请重试。");
        return;
      }
      this.plugin.draftStore.clear(key);
      page[field] = [...values];
      this.renderDetail(page);
      this.component.flushDeferredRefresh();
    };
    append(editor, input, this.editorActions(save, cancel));
    content.replaceWith(editor);
    this.focusWithoutScroll(input);
  }

  async ensureReviewFile(page) {
    const path = normalizePath(String(page?.file?.path ?? ""));
    if (!path) return null;
    let file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (file) return file;
    const kind = reviewKindOf(page);
    const focusKey = reviewFocusKey(kind);
    const yaml = [
      "---", "type: reading-review", `review_period: ${kind}`,
      ...(kind === "week" ? [`week: ${String(page.week ?? "")}`, `period: ${JSON.stringify(String(page.period ?? ""))}`] : []),
      ...(kind === "month" ? [`month: ${extractReviewMonth(page.month, page.file?.name ?? "")}`] : []),
      ...(kind === "year" ? [`year: ${extractReviewYear(page.year, page.file?.name ?? "")}`] : []),
      "valuable_insights: []", `${focusKey}: []`, 'personal_gain: ""', "---", "", `# ${reviewDetailTitle(page)}`, "",
      "本页内容由阅读回顾中心维护；客观统计来自 reading-data.json，主观收获与阅读重点保存在此文件。", "",
    ].join("\n");
    await ensureUiVaultFolder(this.plugin.app, path.split("/").slice(0, -1).join("/"));
    file = await this.plugin.app.vault.create(path, yaml);
    page.file = { path: file.path, name: file.basename };
    page.__wrdVirtual = false;
    return file;
  }

  async saveValue(page, key, value) {
    const path = normalizePath(String(page?.file?.path ?? ""));
    if (!path || !this.plugin.app.fileManager?.processFrontMatter) return false;
    try {
      const file = await this.plugin.contentStore.runOwnWrite(path, async () => {
        const target = await this.ensureReviewFile(page);
        const kind = reviewKindOf(page);
        await this.plugin.app.fileManager.processFrontMatter(target, (frontmatter) => {
          frontmatter.type = "reading-review";
          frontmatter.review_period = kind;
          if (kind === "week") frontmatter.week = String(page.week ?? page.file?.name ?? "");
          else if (kind === "month") frontmatter.month = extractReviewMonth(page.month, page.file?.name ?? "");
          else frontmatter.year = Number(extractReviewYear(page.year, page.file?.name ?? ""));
          frontmatter[key] = value;
          frontmatter.updated_at = new Date().toISOString();
        });
        return target;
      });
      page.file = { path: file.path, name: file.basename };
      page[key] = Array.isArray(value) ? [...value] : value;
      return true;
    } catch (error) {
      console.error("[Weread UI V2] 回顾中心保存失败", error);
      return false;
    }
  }

  renderDetail(page) {
    this.detail.replaceChildren();
    if (!page) {
      this.detail.appendChild(el("div", "wrdn-rc-empty", "暂无这个周期的历史统计。请先执行一次完整同步建立历史数据。"));
      return;
    }
    const labels = reviewLabels(reviewKindOf(page));
    const focusKey = reviewFocusKey(reviewKindOf(page));
    const gain = this.gainOf(page);
    const focusItems = this.focusItemsOf(page);

    const card = el("article", "wrdn-rc-card");
    const cardHeader = el("header", "wrdn-rc-card-header");
    const title = el("div", "wrdn-rc-card-title");
    append(title, el("h2", "", reviewDetailTitle(page)), el("span", "", reviewRangeText(page)));
    cardHeader.appendChild(title);
    const cardBody = el("div", "wrdn-rc-card-body");

    const gainSection = el("section", "wrdn-rc-section wrdn-rc-gain");
    const gainHeading = el("div", "wrdn-rc-section-heading");
    append(gainHeading, pageIcon("spark"), el("h3", "", labels.gain));
    const gainContent = el("div", `wrdn-rc-gain-content${gain ? "" : " is-empty"}`, gain || "尚未填写本周期收获");
    gainContent.tabIndex = 0;
    gainContent.setAttribute("role", "button");
    gainContent.setAttribute("aria-label", `编辑${labels.gain}`);
    gainContent.addEventListener("click", () => this.openGainEditor(page, gainSection, gainContent));
    gainContent.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this.openGainEditor(page, gainSection, gainContent); }
    });
    append(gainSection, gainHeading, gainContent, this.renderMetrics(page));

    const focusSection = el("section", "wrdn-rc-section wrdn-rc-focus");
    const focusHeading = el("div", "wrdn-rc-section-heading");
    append(focusHeading, pageIcon("target"), el("h3", "", labels.focus));
    const focusContent = el("div", "wrdn-rc-focus-content");
    focusContent.tabIndex = 0;
    focusContent.setAttribute("role", "button");
    focusContent.setAttribute("aria-label", `编辑${labels.focus}`);
    if (focusItems.length) {
      const list = el("ul", "wrdn-rc-focus-list");
      focusItems.forEach((item, index) => {
        const row = el("li", item.checked ? "is-checked" : "");
        const check = el("button", "wrdn-rc-check", item.checked ? "✓" : "");
        check.type = "button";
        check.setAttribute("aria-label", `${item.checked ? "取消完成" : "标记完成"}：${item.title}`);
        check.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const raw = focusItems.map((entry) => entry.raw);
          raw[index] = `${item.checked ? "[ ]" : "[x]"} ${this.cleanFocusText(raw[index])}`;
          clearInlineError(focusContent);
          if (!await this.saveValue(page, focusKey, raw)) {
            setInlineError(focusContent, "保存失败，请重试。");
            return;
          }
          page[focusKey] = [...raw];
          this.renderDetail(page);
        });
        append(row, check, el("span", "", item.title));
        list.appendChild(row);
      });
      focusContent.appendChild(list);
    } else {
      focusContent.appendChild(el("p", "wrdn-rc-focus-empty", "尚未填写下一周期阅读重点"));
    }
    focusContent.addEventListener("click", () => this.openFocusEditor(page, focusSection, focusContent));
    focusContent.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this.openFocusEditor(page, focusSection, focusContent); }
    });
    const progress = el("div", "wrdn-rc-progress");
    const completed = focusItems.filter((item) => item.checked).length;
    append(progress, el("span", "", "✓"), el("span", "", `已完成 ${completed}/${focusItems.length} 项`));
    append(focusSection, focusHeading, focusContent, progress);

    append(cardBody, gainSection, focusSection);
    append(card, cardHeader, cardBody);
    this.detail.appendChild(card);
  }

  applyModel(model) {
    this.model = model;
    this.renderCurrent();
  }
}


class BookDetailRenderer {
  constructor(plugin, component, model, session) {
    this.plugin = plugin;
    this.component = component;
    this.model = model;
    this.session = session;
    this.root = null;
    this.reviewEditMode = false;
    this.session.reviewDraftsByBook = this.session.reviewDraftsByBook && typeof this.session.reviewDraftsByBook === "object" ? this.session.reviewDraftsByBook : {};
    this.session.reviewEditingByBook = this.session.reviewEditingByBook && typeof this.session.reviewEditingByBook === "object" ? this.session.reviewEditingByBook : {};
  }

  selectedBook() {
    const id = String(this.session.bookId ?? "").trim();
    return id ? this.model.books.find((book) => book.id === id) ?? null : null;
  }

  backButton() {
    return pageButton("返回阅读看板", "wrdn-p-back", () => void this.plugin.navigation.openHome(this.component.leaf), "back");
  }

  render() {
    this.root = el("main", "wrdn-page");
    this.paint();
    return this.root;
  }

  paint() {
    if (!this.root) return;
    this.root.replaceChildren();
    const book = this.selectedBook();
    if (!book) {
      this.root.className = "wrdn-page";
      const header = el("header", "wrdn-p-header");
      const left = el("div", "wrdn-p-header-left");
      left.appendChild(this.backButton());
      header.appendChild(left);
      append(this.root, header, pageEmpty("未找到对应的微信读书书籍笔记"));
      return;
    }

    this.root.className = "wrdn-page wrdn-bd2-page";
    const bookKey = String(book.id ?? "");
    this.reviewEditMode = Boolean(this.session.reviewEditingByBook?.[bookKey]);
    const synced = normalizedBookContent(book);
    const highlights = synced.highlights;
    const thoughts = deriveThoughtQuotes(synced.thoughts, highlights);
    const reviewText = () => String(book.localReview || synced.syncedReview || "").trim();
    let active = ["highlights", "thoughts", "review"].includes(this.session.activeTab) ? this.session.activeTab : "highlights";
    this.session.activeTab = active;

    const header = el("header", "wrdn-bd2-header");
    header.appendChild(this.backButton());

    const hero = el("section", "wrdn-bd2-hero");
    const cover = pageCoverNode(book, "wrdn-bd2-cover");
    const identity = el("div", "wrdn-bd2-identity");
    const statusText = computedBookStatus(book);
    const status = pageBadge(statusText, statusText === "已读完" ? "done" : "");
    status.classList.add("wrdn-bd2-status");
    const title = el("h1", "wrdn-bd2-title", book.title);
    title.title = book.title;
    title.setAttribute("aria-label", book.title);
    const author = append(el("div", "wrdn-bd2-author"), pageIcon("user"), el("span", "", book.author || "作者未知"));
    const progressBox = el("div", "wrdn-bd2-progress");
    const progressValue = book.progress !== null && book.progress !== undefined && Number.isFinite(Number(book.progress)) ? Math.round(Number(book.progress)) : null;
    const progressHead = append(el("div", "wrdn-bd2-progress-head"), el("strong", "", progressValue === null ? "—" : `${progressValue}%`));
    append(progressBox, progressHead, progressBar(book.progress), el("small", "", `最近阅读：${formatDateZh(book.lastRead, true)}`));
    append(identity, status, title, author, progressBox);

    const side = el("aside", "wrdn-bd2-side");
    const stats = el("div", "wrdn-bd2-stats");
    const durationMetric = durationMetricParts(book.readingSeconds);
    const stat = (iconName, label, value, unit) => {
      const item = el("div", "wrdn-bd2-stat");
      const valueLine = el("div", "wrdn-bd2-stat-value");
      const number = el("strong");
      fillMetricNumber(number, value, unit);
      valueLine.appendChild(number);
      append(item, pageIcon(iconName), el("span", "", label), valueLine);
      return item;
    };
    append(
      stats,
      stat("clock", "阅读时长", durationMetric, ""),
      stat("pen", "划线", displayCount(book.highlights, highlights.length), "条"),
      stat("bulb", "想法", displayCount(book.thoughts, thoughts.length), "条")
    );
    const continueButton = pageButton("继续阅读", "wrdn-p-btn primary wrdn-bd2-continue", async () => {
      clearInlineError(side);
      const result = await openWereadReader(this.plugin, this.model.readingData, book);
      if (!result?.ok) setInlineError(side, result?.message || "无法打开微信读书。");
    }, "book");
    append(side, stats, continueButton);
    append(hero, cover, identity, side);

    const workspace = el("section", "wrdn-bd2-workspace");
    const tabs = el("nav", "wrdn-bd2-tabs");
    const content = el("div", "wrdn-bd2-content");
    append(workspace, tabs, content);
    append(this.root, header, hero, workspace);

    const recordTime = (item) => {
      if (!item?.created) return null;
      const node = el("time", "wrdn-bd2-record-time", formatDateZh(item.created, true));
      node.dateTime = item.created.toISOString();
      return node;
    };
    const emptyState = (message) => el("div", "wrdn-bd2-empty", message);

    const renderHighlights = () => {
      const list = el("div", "wrdn-bd2-list");
      highlights.forEach((item) => {
        const card = el("article", "wrdn-bd2-card wrdn-bd2-highlight");
        const row = el("div", "wrdn-bd2-highlight-row");
        append(row, el("p", "", item.text), recordTime(item));
        card.appendChild(row);
        list.appendChild(card);
      });
      return list.childElementCount ? list : emptyState("还没有同步到划线内容。");
    };

    const renderThoughts = () => {
      const list = el("div", "wrdn-bd2-list");
      thoughts.forEach((item) => {
        const card = el("article", "wrdn-bd2-card wrdn-bd2-thought");
        const head = el("div", "wrdn-bd2-thought-head");
        if (item.quote) head.appendChild(el("blockquote", "wrdn-bd2-quote", `“${item.quote}”`));
        append(head, recordTime(item));
        if (head.childElementCount) card.appendChild(head);
        card.appendChild(el("p", "wrdn-bd2-thought-text", item.text));
        list.appendChild(card);
      });
      return list.childElementCount ? list : emptyState("还没有同步到想法内容。");
    };

    const renderReview = () => {
      const section = el("section", "wrdn-bd2-review");
      if (this.reviewEditMode) {
        const editor = el("div", "wrdn-bd2-review-editor");
        const textarea = el("textarea", "wrdn-bd2-review-textarea");
        textarea.placeholder = "写下你对整本书的看法、感受、观点与反思…";
        textarea.value = String(this.session.reviewDraftsByBook?.[bookKey] ?? reviewText());
        textarea.addEventListener("input", () => { this.session.reviewDraftsByBook[bookKey] = textarea.value; });
        const actions = el("div", "wrdn-form-actions");
        const cancel = pageButton("取消", "wrdn-p-btn", () => {
          this.reviewEditMode = false;
          delete this.session.reviewEditingByBook[bookKey];
          delete this.session.reviewDraftsByBook[bookKey];
          draw();
        });
        const save = pageButton("保存书评", "wrdn-p-btn primary", async () => {
          save.disabled = true;
          clearInlineError(editor);
          try {
            if (!await saveLocalBookReview(this.plugin, book, textarea.value)) {
              setInlineError(editor, "保存书评失败，请重试。");
              return;
            }
            this.reviewEditMode = false;
            delete this.session.reviewEditingByBook[bookKey];
            delete this.session.reviewDraftsByBook[bookKey];
            draw();
          } finally { save.disabled = false; }
        });
        append(actions, cancel, save);
        append(editor, textarea, actions);
        section.appendChild(editor);
      } else {
        const panel = el("article", "wrdn-bd2-review-panel");
        panel.tabIndex = 0;
        panel.setAttribute("role", "button");
        panel.appendChild(el("div", "wrdn-bd2-review-copy", reviewText() || "在这里写下你对整本书的整体感受、观点与思考。"));
        const enter = () => {
          this.reviewEditMode = true;
          this.session.reviewEditingByBook[bookKey] = true;
          this.session.reviewDraftsByBook[bookKey] = reviewText();
          draw();
          requestAnimationFrame(() => {
            const textarea = content.querySelector(".wrdn-bd2-review-textarea");
            if (!textarea || typeof textarea.focus !== "function") return;
            try { textarea.focus({ preventScroll: true }); }
            catch { textarea.focus(); }
            const end = String(textarea.value ?? "").length;
            if (typeof textarea.setSelectionRange === "function") textarea.setSelectionRange(end, end);
          });
        };
        panel.addEventListener("click", enter);
        panel.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); enter(); }
        });
        section.appendChild(panel);
      }
      section.appendChild(append(el("div", "wrdn-bd2-review-hint"), pageIcon("bulb"), el("span", "", "在此记录你对整本书的整体感受、观点与思考。")));
      return section;
    };

    const draw = () => {
      tabs.querySelectorAll("button").forEach((button) => button.classList.toggle("is-active", button.dataset.tab === active));
      content.replaceChildren();
      content.classList.toggle("is-scrollable", active === "highlights" || active === "thoughts");
      content.classList.toggle("is-review", active === "review");
      if (active === "highlights") content.appendChild(renderHighlights());
      else if (active === "thoughts") content.appendChild(renderThoughts());
      else content.appendChild(renderReview());
      content.scrollTop = 0;
    };

    for (const [value, label] of [["highlights", "划线"], ["thoughts", "想法"], ["review", "书评"]]) {
      const button = el("button", "wrdn-bd2-tab", label);
      button.type = "button";
      button.dataset.tab = value;
      button.addEventListener("click", () => {
        active = value;
        this.session.activeTab = value;
        this.reviewEditMode = value === "review" ? this.reviewEditMode : false;
        if (value !== "review") this.session.reviewEditMode = false;
        draw();
      });
      tabs.appendChild(button);
    }
    draw();
  }

  applyModel(model) {
    this.model = model;
    this.paint();
  }
}

class KnowledgeCenterRenderer {
  constructor(plugin, component, model, session) {
    this.plugin = plugin;
    this.component = component;
    this.model = model;
    this.session = session;
    this.root = null;
  }

  render() {
    this.root = el("main", "wrdn-page");
    this.paint();
    return this.root;
  }

  recordDateLabel(date) {
    const value = dateValue(date);
    if (!value) return "时间未记录";
    const diff = shanghaiDayIndex(new Date()) - shanghaiDayIndex(value);
    const hhmm = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(value);
    if (diff === 0) return `今天 ${hhmm}`;
    if (diff === 1) return `昨天 ${hhmm}`;
    return formatDateZh(value, true);
  }

  paint() {
    if (!this.root) return;
    this.root.className = "wrdn-page";
    this.root.replaceChildren();
    const books = this.model.books;
    const aliases = { assets: "content", insights: "content", content: "content", sources: "sources", fields: "fields" };
    let active = aliases[this.session.activeTab] ?? "content";
    let selectedField = String(this.session.selectedField ?? "");
    let contentFilter = ["all", "highlight", "thought"].includes(this.session.contentFilter) ? this.session.contentFilter : "all";
    let contentQuery = String(this.session.contentQuery ?? "");
    let sourceQuery = String(this.session.sourceQuery ?? "");
    let visibleLimit = Math.max(50, Number(this.session.visibleLimit ?? 50) || 50);
    const selectedBook = String(this.session.selectedBook ?? "").trim();

    const sourceBooks = [...books]
      .map((book) => ({ ...book, contentCount: Math.max(0, book.highlights) + Math.max(0, book.thoughts) }))
      .filter((book) => book.contentCount > 0)
      .sort((a, b) => b.contentCount - a.contentCount || (b.lastRead?.getTime() ?? 0) - (a.lastRead?.getTime() ?? 0));
    const maxSourceCount = Math.max(1, ...sourceBooks.map((book) => book.contentCount));

    const fieldMap = new Map();
    for (const book of books) {
      const field = book.field || "未分类";
      const row = fieldMap.get(field) ?? { field, books: [] };
      row.books.push({ ...book, contentCount: Math.max(0, book.highlights) + Math.max(0, book.thoughts) });
      fieldMap.set(field, row);
    }
    const fields = [...fieldMap.values()].map((item) => ({
      ...item,
      highlights: item.books.reduce((sum, book) => sum + Math.max(0, book.highlights), 0),
      thoughts: item.books.reduce((sum, book) => sum + Math.max(0, book.thoughts), 0),
    })).sort((a, b) => b.books.length - a.books.length || a.field.localeCompare(b.field, "zh-CN"));

    const contentRecords = books.flatMap((book) => {
      const synced = normalizedBookContent(book);
      return [
        ...synced.highlights.map((record) => ({ ...record, type: "highlight", book })),
        ...synced.thoughts.map((record) => ({ ...record, type: "thought", book })),
      ];
    }).sort((a, b) => (b.created?.getTime() ?? b.book.modifiedAt?.getTime() ?? b.book.lastRead?.getTime() ?? 0)
      - (a.created?.getTime() ?? a.book.modifiedAt?.getTime() ?? a.book.lastRead?.getTime() ?? 0)
      || a.book.title.localeCompare(b.book.title, "zh-CN"));

    const topbar = el("div", "wrdn-k-topbar");
    topbar.appendChild(pageButton("返回阅读看板", "wrdn-p-back", () => void this.plugin.navigation.openHome(this.component.leaf), "back"));
    const tabs = el("div", "wrdn-p-segmented");
    const body = el("div", "wrdn-p-tab-content wrdn-k-browser-body");
    append(this.root, topbar, tabs, body);

    const openRecordBook = (record) => void this.plugin.navigation.openBook(record.book, record.type === "thought" ? "thoughts" : "highlights", this.component.leaf);
    const typeChip = (value, label) => {
      const button = pageButton(label, `wrdn-k-filter-chip${contentFilter === value ? " is-active" : ""}`, () => {
        contentFilter = value;
        visibleLimit = 50;
        this.session.contentFilter = value;
        this.session.visibleLimit = visibleLimit;
        draw();
      });
      button.dataset.filter = value;
      return button;
    };

    const contentItem = (record) => {
      const kind = record.type === "thought" ? "thought" : "highlight";
      const item = clickableNode(el("article", `wrdn-k-content-item is-${kind}`), () => openRecordBook(record), `打开《${record.book.title}》的${kind === "thought" ? "想法" : "划线"}`);
      const primaryText = record.type === "thought" && record.note ? record.note : record.text;
      const sourceText = record.type === "thought" && record.note ? record.text : "";
      item.appendChild(el("p", "wrdn-k-content-text", primaryText));
      if (sourceText) item.appendChild(el("blockquote", "wrdn-k-content-source", sourceText));
      const meta = el("div", "wrdn-k-record-meta");
      append(meta,
        el("span", `wrdn-k-record-type is-${kind}`, record.type === "thought" ? "想法" : "划线"),
        el("span", "wrdn-k-record-book", `《${record.book.title}》`),
        el("span", "wrdn-k-record-date", this.recordDateLabel(record.created ?? record.book.modifiedAt))
      );
      item.appendChild(meta);
      return item;
    };

    const drawContent = () => {
      const browser = el("section", "wrdn-k-browser");
      const toolbar = el("div", "wrdn-k-browser-toolbar");
      const search = el("input", "wrdn-k-search");
      search.type = "search";
      search.placeholder = "搜索划线、想法或书名";
      search.value = contentQuery;
      search.setAttribute("aria-label", "搜索全部划线与想法");
      const filters = el("div", "wrdn-k-filter-row");
      append(filters, typeChip("all", "全部"), typeChip("highlight", "划线"), typeChip("thought", "想法"));
      const list = el("div", "wrdn-k-content-list");
      const footer = el("div", "wrdn-k-content-footer");
      append(toolbar, search, filters);
      append(browser, toolbar, list, footer);
      body.appendChild(browser);

      const drawList = () => {
        const needle = contentQuery.trim().toLocaleLowerCase("zh-CN");
        const filtered = contentRecords.filter((record) => {
          if (contentFilter !== "all" && record.type !== contentFilter) return false;
          if (!needle) return true;
          return [record.text, record.note, record.chapter, record.book.title, record.book.author]
            .some((value) => String(value ?? "").toLocaleLowerCase("zh-CN").includes(needle));
        });
        list.replaceChildren();
        footer.replaceChildren();
        filtered.slice(0, visibleLimit).forEach((record) => list.appendChild(contentItem(record)));
        if (!filtered.length) list.appendChild(pageEmpty(contentRecords.length ? "没有找到匹配内容" : "尚未识别到同步的划线或想法"));
        if (filtered.length > visibleLimit) {
          footer.appendChild(pageButton(`继续显示 ${Math.min(50, filtered.length - visibleLimit)} 条`, "wrdn-k-more", () => {
            visibleLimit += 50;
            this.session.visibleLimit = visibleLimit;
            drawList();
          }));
        } else if (filtered.length) footer.appendChild(el("span", "wrdn-k-result-note", `已显示 ${filtered.length} 条内容`));
      };
      search.addEventListener("input", () => {
        contentQuery = search.value;
        visibleLimit = 50;
        this.session.contentQuery = contentQuery;
        this.session.visibleLimit = visibleLimit;
        drawList();
      });
      drawList();
    };

    const sourceCard = (book) => {
      const selectedClass = selectedBook && selectedBook === book.id ? " is-selected" : "";
      const card = clickableNode(el("article", `wrdn-k-source-card${selectedClass}`), () => void this.plugin.navigation.openBook(book, "highlights", this.component.leaf), `打开《${book.title}》的划线与想法`);
      const cover = pageCoverNode(book, "wrdn-k-source-card-cover");
      const copy = el("div", "wrdn-k-source-card-copy");
      const titleRow = el("div", "wrdn-k-source-card-title");
      append(titleRow, el("strong", "", book.title), el("b", "", `${book.contentCount} 条`));
      const stats = el("div", "wrdn-k-source-card-stats");
      append(stats, el("span", "", `${book.highlights} 划线`), el("span", "", `${book.thoughts} 想法`));
      const track = el("div", "wrdn-k-source-card-track");
      const fill = el("i");
      fill.style.width = `${Math.max(4, Math.round((book.contentCount / maxSourceCount) * 100))}%`;
      track.appendChild(fill);
      append(copy, titleRow, el("small", "", book.author || "作者未记录"), stats, track);
      append(card, cover, copy);
      return card;
    };

    const drawSources = () => {
      const section = el("section", "wrdn-k-browser");
      const search = el("input", "wrdn-k-search");
      search.type = "search";
      search.placeholder = "搜索书名或作者";
      search.value = sourceQuery;
      search.setAttribute("aria-label", "搜索来源书籍");
      const grid = el("div", "wrdn-k-source-card-grid");
      const drawGrid = () => {
        const needle = sourceQuery.trim().toLocaleLowerCase("zh-CN");
        const filtered = sourceBooks.filter((book) => !needle || [book.title, book.author].some((value) => String(value ?? "").toLocaleLowerCase("zh-CN").includes(needle)));
        grid.replaceChildren();
        filtered.forEach((book) => grid.appendChild(sourceCard(book)));
        if (!filtered.length) grid.appendChild(pageEmpty(sourceBooks.length ? "没有找到匹配书籍" : "暂无可统计的来源书籍"));
      };
      search.addEventListener("input", () => { sourceQuery = search.value; this.session.sourceQuery = sourceQuery; drawGrid(); });
      append(section, search, grid);
      body.appendChild(section);
      drawGrid();
    };

    const drawFields = () => {
      const section = el("section", "wrdn-k-fields-layout");
      const fieldGrid = el("div", "wrdn-k-field-grid");
      const detail = el("section", "wrdn-p-card wrdn-k-field-detail");
      const selected = fields.find((item) => item.field === selectedField) ?? fields[0];
      if (selected && !selectedField) { selectedField = selected.field; this.session.selectedField = selectedField; }
      for (const item of fields) {
        const card = clickableNode(el("article", `wrdn-k-field-card${selectedField === item.field ? " is-selected" : ""}`), () => {
          selectedField = item.field;
          this.session.selectedField = selectedField;
          draw();
        });
        append(card, el("h3", "", item.field), el("strong", "", `${item.books.length} 本`), el("p", "", `${item.highlights} 条划线 · ${item.thoughts} 条想法`));
        fieldGrid.appendChild(card);
      }
      if (selected) {
        const head = el("div", "wrdn-k-field-detail-head");
        append(head, append(el("div", ""), el("h2", "wrdn-p-section-title", selected.field), el("p", "wrdn-p-muted", `${selected.books.length} 本书 · ${selected.highlights} 条划线 · ${selected.thoughts} 条想法`)));
        detail.appendChild(head);
        const list = el("div", "wrdn-k-field-books");
        [...selected.books].sort((a, b) => b.contentCount - a.contentCount || (b.lastRead?.getTime() ?? 0) - (a.lastRead?.getTime() ?? 0)).forEach((book) => {
          const row = clickableNode(el("article", "wrdn-k-field-book-row"), () => void this.plugin.navigation.openBook(book, "highlights", this.component.leaf), `打开《${book.title}》的划线与想法`);
          const copy = el("div", "wrdn-k-field-book-copy");
          append(copy, el("strong", "", book.title), book.author ? el("small", "", book.author) : null);
          const stats = el("div", "wrdn-k-field-book-stats");
          append(stats, el("span", "", `${book.highlights} 划线`), el("span", "", `${book.thoughts} 想法`), el("b", "", `${book.contentCount} 条`));
          append(row, pageCoverNode(book, "wrdn-k-field-book-cover"), copy, stats);
          list.appendChild(row);
        });
        detail.appendChild(list);
      } else detail.appendChild(pageEmpty("暂无阅读主题数据。"));
      append(section, fieldGrid, detail);
      body.appendChild(section);
    };

    const draw = () => {
      tabs.querySelectorAll("button").forEach((button) => button.classList.toggle("is-active", button.dataset.tab === active));
      body.replaceChildren();
      if (active === "content") drawContent();
      else if (active === "sources") drawSources();
      else drawFields();
    };

    for (const [value, label] of [["content", "全部内容"], ["sources", "来源书籍"], ["fields", "阅读主题"]]) {
      const button = pageButton(label, "wrdn-p-chip", () => { active = value; this.session.activeTab = value; draw(); });
      button.dataset.tab = value;
      tabs.appendChild(button);
    }
    draw();
  }

  applyModel(model) {
    this.model = model;
    this.paint();
  }
}

const SHELF_NATIVE_STYLE = `
.wrdn-p-book-card { min-width: 0; overflow: hidden; }
.wrdn-p-book-card-info { min-width: 0; max-width: 100%; }
.wrdn-p-book-card h3 { min-width: 0; max-width: 100%; overflow: hidden; overflow-wrap: anywhere; word-break: break-word; }
`;

class ShelfRenderer {
  constructor(plugin, component, model, session) {
    this.plugin = plugin;
    this.component = component;
    this.model = model;
    this.session = session;
    this.filter = ["reading", "done", "all"].includes(session.filter) ? session.filter : "all";
    this.keyword = String(session.keyword ?? "");
    this.filterBar = null;
    this.grid = null;
    this.search = null;
  }

  render() {
    const root = el("main", "wrdn-page");
    const header = el("header", "wrdn-p-header");
    const left = el("div", "wrdn-p-header-left");
    const back = el("button", "wrdn-p-back");
    back.type = "button";
    append(back, pageIcon("back"), el("span", "", "返回阅读看板"));
    back.addEventListener("click", () => void this.plugin.navigation.openHome(this.component.leaf));
    left.appendChild(back);
    header.appendChild(left);

    const controls = el("div", "wrdn-p-controls");
    const searchWrap = el("label", "wrdn-p-search");
    this.search = el("input", "wrdn-p-input");
    this.search.type = "search";
    this.search.placeholder = "搜索书名或作者";
    this.search.value = this.keyword;
    this.search.addEventListener("input", () => {
      this.keyword = this.search.value.trim();
      this.session.keyword = this.keyword;
      this.draw();
    });
    append(searchWrap, pageIcon("search"), this.search);

    this.filterBar = el("div", "wrdn-p-segmented");
    for (const [value, label] of [["reading", "正在阅读"], ["done", "已读完"], ["all", "全部"]]) {
      const button = el("button", `wrdn-p-chip${this.filter === value ? " is-active" : ""}`, label);
      button.type = "button";
      button.dataset.filter = value;
      button.addEventListener("click", () => {
        if (this.filter === value) return;
        this.filter = value;
        this.session.filter = value;
        this.draw();
      });
      this.filterBar.appendChild(button);
    }
    append(controls, searchWrap, this.filterBar);
    this.grid = el("div", "wrdn-p-book-grid");
    append(root, header, controls, this.grid);
    this.draw();
    return root;
  }

  rows() {
    let books = [...this.model.orderedBooks];
    if (this.filter === "reading") books = books.filter((book) => computedBookStatus(book) === "正在阅读");
    if (this.filter === "done") books = books.filter((book) => computedBookStatus(book) === "已读完");
    if (this.keyword) {
      const query = this.keyword.toLocaleLowerCase("zh-CN");
      books = books.filter((book) => `${book.title} ${book.author}`.toLocaleLowerCase("zh-CN").includes(query));
    }
    return books;
  }

  progressNode(book) {
    const progress = book.progress !== null && book.progress !== undefined && Number.isFinite(Number(book.progress))
      ? Math.min(100, Math.max(0, Number(book.progress)))
      : null;
    const row = el("div", "wrdn-p-book-card-progress");
    const bar = el("span", "wrdn-p-progress");
    const fill = el("i");
    fill.style.width = `${progress ?? 0}%`;
    bar.appendChild(fill);
    append(row, el("strong", "", progress === null ? "—" : `${Math.round(progress)}%`), bar);
    return row;
  }

  bookCard(book) {
    const card = el("article", "wrdn-p-book-card is-clickable");
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `打开《${book.title}》详情`);
    const open = () => void this.plugin.navigation.openBook(book, "highlights", this.component.leaf);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
    });
    const info = el("div", "wrdn-p-book-card-info");
    const status = computedBookStatus(book);
    append(info,
      el("h3", "", book.title),
      el("p", "", book.author),
      el("span", `wrdn-p-badge${status === "已读完" ? " done" : status === "其他" ? " neutral" : ""}`, status)
    );
    append(card,
      pageCoverNode(book),
      info,
      this.progressNode(book),
      el("div", "wrdn-p-book-meta", `${Math.max(0, book.highlights)} 条划线 · 最近阅读 ${relativeDayLabel(book.lastRead)}`)
    );
    return card;
  }

  draw() {
    if (!this.grid || !this.filterBar) return;
    this.filterBar.querySelectorAll("button").forEach((button) => button.classList.toggle("is-active", button.dataset.filter === this.filter));
    this.grid.replaceChildren();
    const rows = this.rows();
    if (!rows.length) {
      const message = this.keyword ? "没有符合条件的书籍" : this.filter === "reading" ? "暂无正在阅读的书籍" : this.filter === "done" ? "暂无已读完书籍" : "书架数据尚未同步";
      const empty = el("div", "wrdn-rc-empty wrdn-p-book-grid-empty", message);
      this.grid.appendChild(empty);
      return;
    }
    rows.forEach((book) => this.grid.appendChild(this.bookCard(book)));
  }

  applyModel(model) {
    this.model = model;
    this.draw();
  }
}


class NativeBookDetailView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.navigation = true;
    this.mount = null;
    this.shadow = null;
    this.styleNode = null;
    this.renderer = null;
    this.unsubData = null;
    this.unsubContent = null;
    this.refreshToken = 0;
  }

  getViewType() { return BOOK_DETAIL_VIEW_TYPE; }
  getDisplayText() { return "书籍详情"; }
  getIcon() { return "book-open"; }

  async onOpen() {
    this.containerEl.removeClass("wrdn-v2-native-transitioning");
    this.contentEl.empty();
    this.contentEl.addClass("wrdn-v2-native-view", "wrdn-v2-native-book-detail");
    this.containerEl.addClass("wrdn-v2-native-view-shell", "wrdn-v2-native-book-detail-shell");
    this.contentEl.style.overflow = "hidden";
    this.mount = el("div", "wrdn-v2-native-mount");
    this.mount.style.height = "100%";
    this.mount.style.minHeight = "0";
    this.mount.style.overflow = "hidden";
    this.shadow = this.mount.attachShadow({ mode: "open" });
    this.contentEl.appendChild(this.mount);
    await this.mountInitial();
    this.unsubData = this.plugin.dataStore.subscribe(() => void this.refreshModel("data"));
    this.unsubContent = this.plugin.contentStore.subscribe((paths) => {
      const relevant = [...paths].some((path) => path === normalizePath(DEFAULT_FUNCTION_STYLE) || path.startsWith(`${normalizePath(BOOK_REVIEW_FOLDER)}/`));
      if (relevant) void this.refreshModel("content", paths);
    });
  }

  async mountInitial() {
    const token = ++this.refreshToken;
    try {
      const [load, cssText] = await Promise.all([this.plugin.dataStore.getSnapshot(), this.plugin.textCache.read(DEFAULT_FUNCTION_STYLE)]);
      const model = await buildBooksPageModel(this.plugin, load);
      if (token !== this.refreshToken || !this.shadow) return;
      const session = this.plugin.sessionStore.page(`${BOOK_DETAIL_FILE}::book-detail`);
      const renderer = new BookDetailRenderer(this.plugin, this, model, session);
      const style = document.createElement("style");
      style.textContent = cssText;
      style.dataset.wrdnV2 = "book-detail-v2-css";
      this.renderer = renderer;
      this.styleNode = style;
      this.shadow.replaceChildren(style, renderer.render());
      this.mount.dataset.wrdnReady = "true";
    } catch (error) {
      console.error("[Weread UI V2] Native 书籍详情首次挂载失败", error);
      if (token !== this.refreshToken || !this.shadow) return;
      append(this.shadow, el("div", "wrdn-v2-fatal-error", "页面渲染失败，请查看同步诊断或开发者控制台。"));
    }
  }

  async refreshModel(reason, paths = null) {
    if (!this.renderer) return;
    if (reason === "content" && paths?.has?.(normalizePath(DEFAULT_FUNCTION_STYLE)) && this.styleNode) {
      this.plugin.textCache.invalidate(DEFAULT_FUNCTION_STYLE);
      try { this.styleNode.textContent = await this.plugin.textCache.read(DEFAULT_FUNCTION_STYLE); }
      catch (error) { console.error("[Weread UI V2] 书籍详情样式刷新失败", error); }
    }
    if (reason === "content" && paths && ![...paths].some((path) => path.startsWith(`${normalizePath(BOOK_REVIEW_FOLDER)}/`))) return;
    const token = ++this.refreshToken;
    try {
      const load = await this.plugin.dataStore.getSnapshot();
      const model = await buildBooksPageModel(this.plugin, load);
      if (token !== this.refreshToken || !this.renderer) return;
      this.renderer.applyModel(model);
    } catch (error) {
      console.error("[Weread UI V2] 书籍详情刷新失败", error);
    }
  }

  async onClose() {
    this.refreshToken += 1;
    this.unsubData?.();
    this.unsubContent?.();
    this.unsubData = this.unsubContent = null;
    this.renderer = null;
    this.styleNode = null;
    this.shadow = null;
    this.mount = null;
    this.contentEl.style.removeProperty("overflow");
    this.contentEl.removeClass("wrdn-v2-native-view", "wrdn-v2-native-book-detail");
    this.containerEl.removeClass("wrdn-v2-native-view-shell", "wrdn-v2-native-book-detail-shell");
  }
}

class NativeKnowledgeCenterView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.navigation = true;
    this.mount = null;
    this.shadow = null;
    this.styleNode = null;
    this.renderer = null;
    this.unsubData = null;
    this.unsubContent = null;
    this.refreshToken = 0;
  }

  getViewType() { return KNOWLEDGE_VIEW_TYPE; }
  getDisplayText() { return "知识中心"; }
  getIcon() { return "lightbulb"; }

  async onOpen() {
    this.containerEl.removeClass("wrdn-v2-native-transitioning");
    this.contentEl.empty();
    this.contentEl.addClass("wrdn-v2-native-view", "wrdn-v2-native-knowledge");
    this.containerEl.addClass("wrdn-v2-native-view-shell", "wrdn-v2-native-knowledge-shell");
    this.mount = el("div", "wrdn-v2-native-mount wrdn-page-host");
    this.shadow = this.mount.attachShadow({ mode: "open" });
    this.contentEl.appendChild(this.mount);
    await this.mountInitial();
    this.unsubData = this.plugin.dataStore.subscribe(() => void this.refreshModel("data"));
    this.unsubContent = this.plugin.contentStore.subscribe((paths) => {
      if (paths.has(normalizePath(DEFAULT_FUNCTION_STYLE))) void this.refreshModel("style", paths);
    });
  }

  async mountInitial() {
    const token = ++this.refreshToken;
    try {
      const [load, cssText] = await Promise.all([this.plugin.dataStore.getSnapshot(), this.plugin.textCache.read(DEFAULT_FUNCTION_STYLE)]);
      const model = await buildBooksPageModel(this.plugin, load);
      if (token !== this.refreshToken || !this.shadow) return;
      const session = this.plugin.sessionStore.page(`${KNOWLEDGE_FILE}::knowledge`);
      const renderer = new KnowledgeCenterRenderer(this.plugin, this, model, session);
      const style = document.createElement("style");
      style.textContent = cssText;
      style.dataset.wrdnV2 = "knowledge-v2-css";
      this.renderer = renderer;
      this.styleNode = style;
      this.shadow.replaceChildren(style, renderer.render());
      this.mount.dataset.wrdnReady = "true";
    } catch (error) {
      console.error("[Weread UI V2] Native 知识中心首次挂载失败", error);
      if (token !== this.refreshToken || !this.shadow) return;
      append(this.shadow, el("div", "wrdn-v2-fatal-error", "页面渲染失败，请查看同步诊断或开发者控制台。"));
    }
  }

  async refreshModel(reason, paths = null) {
    if (!this.renderer) return;
    if (reason === "style" && paths?.has?.(normalizePath(DEFAULT_FUNCTION_STYLE)) && this.styleNode) {
      this.plugin.textCache.invalidate(DEFAULT_FUNCTION_STYLE);
      try { this.styleNode.textContent = await this.plugin.textCache.read(DEFAULT_FUNCTION_STYLE); }
      catch (error) { console.error("[Weread UI V2] 知识中心样式刷新失败", error); }
      return;
    }
    const token = ++this.refreshToken;
    try {
      const load = await this.plugin.dataStore.getSnapshot();
      const model = await buildBooksPageModel(this.plugin, load);
      if (token !== this.refreshToken || !this.renderer) return;
      this.renderer.applyModel(model);
    } catch (error) {
      console.error("[Weread UI V2] 知识中心刷新失败", error);
    }
  }

  async onClose() {
    this.refreshToken += 1;
    this.unsubData?.();
    this.unsubContent?.();
    this.unsubData = this.unsubContent = null;
    this.renderer = null;
    this.styleNode = null;
    this.shadow = null;
    this.mount = null;
    this.contentEl.removeClass("wrdn-v2-native-view", "wrdn-v2-native-knowledge");
    this.containerEl.removeClass("wrdn-v2-native-view-shell", "wrdn-v2-native-knowledge-shell");
  }
}

class NativeShelfView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.navigation = true;
    this.mount = null;
    this.shadow = null;
    this.styleNode = null;
    this.renderer = null;
    this.unsubData = null;
    this.unsubContent = null;
    this.refreshToken = 0;
  }

  getViewType() { return SHELF_VIEW_TYPE; }
  getDisplayText() { return "完整书架"; }
  getIcon() { return "library"; }

  async onOpen() {
    this.containerEl.removeClass("wrdn-v2-native-transitioning");
    this.contentEl.empty();
    this.contentEl.addClass("wrdn-v2-native-view", "wrdn-v2-native-shelf");
    this.containerEl.addClass("wrdn-v2-native-view-shell", "wrdn-v2-native-shelf-shell");
    this.mount = el("div", "wrdn-v2-native-mount wrdn-page-host");
    this.shadow = this.mount.attachShadow({ mode: "open" });
    this.contentEl.appendChild(this.mount);
    await this.mountInitial();
    this.unsubData = this.plugin.dataStore.subscribe(() => void this.refreshModel("data"));
    this.unsubContent = this.plugin.contentStore.subscribe((paths) => {
      if (paths.has(normalizePath(DEFAULT_FUNCTION_STYLE))) void this.refreshModel("style", paths);
    });
  }

  async mountInitial() {
    const token = ++this.refreshToken;
    try {
      const [load, cssText] = await Promise.all([this.plugin.dataStore.getSnapshot(), this.plugin.textCache.read(DEFAULT_FUNCTION_STYLE)]);
      const model = await buildShelfModel(this.plugin, load);
      if (token !== this.refreshToken || !this.shadow) return;
      const session = this.plugin.sessionStore.page(`${SHELF_FILE}::shelf`);
      const renderer = new ShelfRenderer(this.plugin, this, model, session);
      const style = document.createElement("style");
      style.textContent = `${cssText}\n${SHELF_NATIVE_STYLE}`;
      style.dataset.wrdnV2 = "shelf-v2-css";
      this.renderer = renderer;
      this.styleNode = style;
      this.shadow.replaceChildren(style, renderer.render());
      this.mount.dataset.wrdnReady = "true";
    } catch (error) {
      console.error("[Weread UI V2] Native 完整书架首次挂载失败", error);
      if (token !== this.refreshToken || !this.shadow) return;
      append(this.shadow, el("div", "wrdn-v2-fatal-error", "页面渲染失败，请查看同步诊断或开发者控制台。"));
    }
  }

  async refreshModel(reason, paths = null) {
    if (!this.renderer) return;
    if (reason === "style" && paths?.has?.(normalizePath(DEFAULT_FUNCTION_STYLE)) && this.styleNode) {
      this.plugin.textCache.invalidate(DEFAULT_FUNCTION_STYLE);
      try { this.styleNode.textContent = `${await this.plugin.textCache.read(DEFAULT_FUNCTION_STYLE)}\n${SHELF_NATIVE_STYLE}`; }
      catch (error) { console.error("[Weread UI V2] 完整书架样式刷新失败", error); }
    }
    if (reason === "style") return;
    const token = ++this.refreshToken;
    try {
      const load = await this.plugin.dataStore.getSnapshot();
      const model = await buildShelfModel(this.plugin, load);
      if (token !== this.refreshToken || !this.renderer) return;
      this.renderer.applyModel(model);
    } catch (error) {
      console.error("[Weread UI V2] 完整书架数据刷新失败", error);
    }
  }

  async onClose() {
    this.refreshToken += 1;
    this.unsubData?.();
    this.unsubContent?.();
    this.unsubData = this.unsubContent = null;
    this.renderer = null;
    this.styleNode = null;
    this.shadow = null;
    this.mount = null;
    this.contentEl.removeClass("wrdn-v2-native-view", "wrdn-v2-native-shelf");
    this.containerEl.removeClass("wrdn-v2-native-view-shell", "wrdn-v2-native-shelf-shell");
  }
}

class NativeReviewCenterView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.navigation = true;
    this.mount = null;
    this.shadow = null;
    this.styleNode = null;
    this.renderer = null;
    this.unsubData = null;
    this.unsubContent = null;
    this.refreshToken = 0;
    this.pendingRefresh = false;
  }

  getViewType() { return REVIEW_VIEW_TYPE; }
  getDisplayText() { return "回顾中心"; }
  getIcon() { return "calendar-range"; }

  async onOpen() {
    this.containerEl.removeClass("wrdn-v2-native-transitioning");
    this.contentEl.empty();
    this.contentEl.addClass("wrdn-v2-native-view", "wrdn-v2-native-review");
    this.containerEl.addClass("wrdn-v2-native-view-shell", "wrdn-v2-native-review-shell");
    this.mount = el("div", "wrdn-v2-native-mount wrdn-rc-mount wrdn-rc-host");
    this.shadow = this.mount.attachShadow({ mode: "open" });
    this.contentEl.appendChild(this.mount);
    await this.mountInitial();
    this.unsubData = this.plugin.dataStore.subscribe(() => void this.refreshModel("data"));
    this.unsubContent = this.plugin.contentStore.subscribe((paths) => {
      const relevant = [...paths].some((path) => path === normalizePath(DEFAULT_FUNCTION_STYLE) || path.startsWith(`${normalizePath(REVIEW_FOLDER)}/`));
      if (relevant) void this.refreshModel("content", paths);
    });
  }

  async mountInitial() {
    const token = ++this.refreshToken;
    try {
      const [load, cssText] = await Promise.all([this.plugin.dataStore.getSnapshot(), this.plugin.textCache.read(DEFAULT_FUNCTION_STYLE)]);
      const model = await buildReviewCenterModel(this.plugin, load);
      if (token !== this.refreshToken || !this.shadow) return;
      const session = this.plugin.sessionStore.page(`${REVIEW_CENTER_FILE}::review-center`);
      const renderer = new ReviewCenterRenderer(this.plugin, this, model, session);
      const style = document.createElement("style");
      style.textContent = `${cssText}\n${REVIEW_HISTORY_STYLE}`;
      style.dataset.wrdnV2 = "review-center-v2-css";
      this.renderer = renderer;
      this.styleNode = style;
      this.shadow.replaceChildren(style, renderer.render());
      this.mount.dataset.wrdnReady = "true";
    } catch (error) {
      console.error("[Weread UI V2] Native 回顾中心首次挂载失败", error);
      if (token !== this.refreshToken || !this.shadow) return;
      append(this.shadow, el("div", "wrdn-v2-fatal-error", "页面渲染失败，请查看同步诊断或开发者控制台。"));
    }
  }

  async refreshModel(reason, paths = null) {
    if (!this.renderer) return;
    if (reason === "content" && paths?.has?.(normalizePath(DEFAULT_FUNCTION_STYLE)) && this.styleNode) {
      this.plugin.textCache.invalidate(DEFAULT_FUNCTION_STYLE);
      try { this.styleNode.textContent = `${await this.plugin.textCache.read(DEFAULT_FUNCTION_STYLE)}\n${REVIEW_HISTORY_STYLE}`; }
      catch (error) { console.error("[Weread UI V2] 回顾中心样式刷新失败", error); }
    }
    if (this.plugin.draftStore.hasActive("review-center:")) {
      this.pendingRefresh = true;
      return;
    }
    const token = ++this.refreshToken;
    try {
      const load = await this.plugin.dataStore.getSnapshot();
      const model = await buildReviewCenterModel(this.plugin, load);
      if (token !== this.refreshToken || !this.renderer) return;
      this.renderer.applyModel(model);
    } catch (error) {
      console.error("[Weread UI V2] 回顾中心局部刷新失败", error);
    }
  }

  flushDeferredRefresh() {
    if (!this.pendingRefresh || this.plugin.draftStore.hasActive("review-center:")) return;
    this.pendingRefresh = false;
    void this.refreshModel("deferred");
  }

  async onClose() {
    this.refreshToken += 1;
    this.pendingRefresh = false;
    this.unsubData?.();
    this.unsubContent?.();
    this.unsubData = this.unsubContent = null;
    this.renderer = null;
    this.styleNode = null;
    this.shadow = null;
    this.mount = null;
    this.contentEl.removeClass("wrdn-v2-native-view", "wrdn-v2-native-review");
    this.containerEl.removeClass("wrdn-v2-native-view-shell", "wrdn-v2-native-review-shell");
  }
}

class NativeHomeDashboardView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.navigation = true;
    this.config = Object.freeze({
      page: "home",
      title: "我的阅读看板",
      palette: "暖棕",
      dataFile: DEFAULT_DATA_FILE,
      styleFile: DEFAULT_HOME_STYLE,
    });
    this.instanceId = `wrdv2-native-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    this.mount = null;
    this.shadow = null;
    this.styleNode = null;
    this.currentRenderer = null;
    this.unsubData = null;
    this.unsubContent = null;
    this.unsubSync = null;
    this.mountToken = 0;
    this.dataRefreshToken = 0;
    this.contentRefreshToken = 0;
    this.reviewRefreshToken = 0;
    this.pendingContentPaths = new Set();
    this.pendingReviewDataRefresh = false;
  }

  getViewType() { return HOME_VIEW_TYPE; }
  getDisplayText() { return "00-阅读看板"; }
  getIcon() { return "book-open"; }

  reconcileDrafts(model) {
    this.plugin.draftStore.reconcileActive([
      `home:review:week:${model.activeWeekKey}:`,
      `home:review:month:${model.activeMonthKey}:`,
      `home:review:year:${model.activeYear}:`,
    ]);
  }

  async onOpen() {
    this.containerEl.removeClass("wrdn-v2-native-transitioning");
    this.contentEl.empty();
    this.contentEl.addClass("wrdn-v2-native-view", "wrdn-v2-native-home");
    this.containerEl.addClass("wrdn-v2-native-view-shell", "wrdn-v2-native-home-shell");

    this.mount = document.createElement("div");
    this.mount.className = "wrdn-v2172-persistent-mount wrdn-v2-native-mount";
    this.mount.dataset.instanceKey = this.instanceId;
    this.shadow = this.mount.attachShadow({ mode: "open" });
    this.contentEl.appendChild(this.mount);

    await this.mountInitial();
    this.unsubData = this.plugin.dataStore.subscribe((snapshot) => void this.refreshData(snapshot));
    this.unsubContent = this.plugin.contentStore.subscribe((paths) => this.handleContentChange(paths));
    this.unsubSync = this.plugin.syncController.subscribe((state) => this.currentRenderer?.updateSyncStatus(state));
  }

  async mountInitial() {
    const token = ++this.mountToken;
    try {
      const [load, cssText] = await Promise.all([
        this.plugin.dataStore.getSnapshot(),
        this.plugin.textCache.read(DEFAULT_HOME_STYLE),
      ]);
      const model = await buildHomeModel(this.plugin, load);
      this.reconcileDrafts(model);
      if (token !== this.mountToken || !this.shadow) return;
      const session = this.plugin.sessionStore.page(`${HOME_FILE}::home`);
      const renderer = new HomeRenderer(this.plugin, this, model, session);
      const root = renderer.render();
      const style = document.createElement("style");
      style.textContent = cssText;
      style.dataset.wrdnV2 = "home-hotfix17-css";
      const fragment = document.createDocumentFragment();
      fragment.append(style, root);
      if (token !== this.mountToken || !this.shadow) return;
      this.currentRenderer = renderer;
      this.styleNode = style;
      this.shadow.replaceChildren(fragment);
      renderer.updateSyncStatus(this.plugin.syncController.state);
      this.mount.dataset.wrdnReady = "true";
      this.mount.dataset.renderReason = "native-open";
    } catch (error) {
      console.error("[Weread UI V2] Native 首页首次挂载失败", error);
      if (token !== this.mountToken || !this.shadow) return;
      const message = el("div", "wrdn-v2-fatal-error");
      append(message, el("strong", "", "首页渲染失败"), el("div", "", "请查看同步诊断或开发者控制台。"));
      this.shadow.replaceChildren(message);
    }
  }

  async refreshData(snapshot) {
    if (!this.currentRenderer) return;
    const token = ++this.dataRefreshToken;
    try {
      const model = await buildHomeModel(this.plugin, snapshot);
      this.reconcileDrafts(model);
      if (token !== this.dataRefreshToken || !this.currentRenderer) return;
      const scopes = ["header", "today", "inspiration", "insights", "shelf", "rhythm"];
      if (this.plugin.draftStore.hasActive("home:review:")) this.pendingReviewDataRefresh = true;
      else scopes.push("review");
      this.currentRenderer.applyModel(model, scopes);
      this.mount.dataset.renderReason = "data-patch";
    } catch (error) {
      console.error("[Weread UI V2] 首页数据局部刷新失败", error);
    }
  }

  handleContentChange(paths) {
    const immediate = new Set();
    for (const rawPath of paths || []) {
      const path = normalizePath(String(rawPath || ""));
      if (!path) continue;
      if (path.startsWith(`${normalizePath(REVIEW_FOLDER)}/`) && this.plugin.draftStore.hasActive("home:review:")) {
        this.pendingContentPaths.add(path);
      } else {
        immediate.add(path);
      }
    }
    if (immediate.size) void this.refreshContent(immediate);
  }

  async refreshContent(paths) {
    if (!this.currentRenderer || !paths?.size) return;
    const stylePath = normalizePath(DEFAULT_HOME_STYLE);
    const configPath = normalizePath(CONFIG_FILE);
    const hasStyle = paths.has(stylePath);
    const hasConfig = paths.has(configPath);
    const hasReview = [...paths].some((path) => path.startsWith(`${normalizePath(REVIEW_FOLDER)}/`));

    if (hasStyle && this.styleNode) {
      try { this.styleNode.textContent = await this.plugin.textCache.read(DEFAULT_HOME_STYLE); }
      catch (error) { console.error("[Weread UI V2] 首页样式局部刷新失败", error); }
    }
    if (!hasConfig && !hasReview) return;

    const token = ++this.contentRefreshToken;
    try {
      const load = await this.plugin.dataStore.getSnapshot();
      const nextModel = await buildHomeModel(this.plugin, load);
      this.reconcileDrafts(nextModel);
      if (token !== this.contentRefreshToken || !this.currentRenderer) return;

      const previous = this.currentRenderer.model;
      const scopes = [];
      if (hasConfig && configSignature(previous.config) !== configSignature(nextModel.config)) scopes.push("today", "insights");
      if (hasReview) {
        const changed = ["week", "month", "year"].some((kind) => reviewSignature(previous.reviews?.[kind]) !== reviewSignature(nextModel.reviews?.[kind]));
        if (changed) scopes.push("review");
      }
      if (!scopes.length) return;
      this.currentRenderer.applyModel(nextModel, scopes);
      this.mount.dataset.renderReason = `content-patch:${scopes.join(",")}`;
    } catch (error) {
      console.error("[Weread UI V2] 首页内容局部刷新失败", error);
    }
  }

  flushDeferredContentRefresh() {
    if (this.plugin.draftStore.hasActive("home:review:")) return;
    const paths = new Set(this.pendingContentPaths);
    this.pendingContentPaths.clear();
    const needsReviewData = this.pendingReviewDataRefresh;
    this.pendingReviewDataRefresh = false;
    if (paths.size) void this.refreshContent(paths);
    if (needsReviewData) void this.refreshDataFromCurrentSnapshot();
  }

  async refreshDataFromCurrentSnapshot() {
    const snapshot = await this.plugin.dataStore.getSnapshot();
    if (!this.currentRenderer || this.plugin.draftStore.hasActive("home:review:")) {
      this.pendingReviewDataRefresh = true;
      return;
    }
    const token = ++this.reviewRefreshToken;
    try {
      const nextModel = await buildHomeModel(this.plugin, snapshot);
      this.reconcileDrafts(nextModel);
      if (token !== this.reviewRefreshToken || !this.currentRenderer) return;
      this.currentRenderer.applyModel(nextModel, ["review"]);
      this.mount.dataset.renderReason = "deferred-review-data-patch";
    } catch (error) {
      console.error("[Weread UI V2] 延迟回顾局部刷新失败", error);
    }
  }

  async onClose() {
    this.mountToken += 1;
    this.dataRefreshToken += 1;
    this.contentRefreshToken += 1;
    this.reviewRefreshToken += 1;
    this.unsubData?.();
    this.unsubContent?.();
    this.unsubSync?.();
    this.unsubData = this.unsubContent = this.unsubSync = null;
    this.currentRenderer = null;
    this.pendingContentPaths.clear();
    this.pendingReviewDataRefresh = false;
    this.styleNode = null;
    this.shadow = null;
    this.mount = null;
    this.contentEl.removeClass("wrdn-v2-native-view", "wrdn-v2-native-home");
    this.containerEl.removeClass("wrdn-v2-native-view-shell", "wrdn-v2-native-home-shell");
  }
}


class NativeFileViewRouter {
  constructor(plugin, routes) {
    this.plugin = plugin;
    this.routes = new Map(routes.map((route) => [normalizePath(route.file), { ...route, file: normalizePath(route.file) }]));
    this.pending = new Map();
    this.busy = new Set();
  }

  routeFor(file) { return this.routes.get(normalizePath(String(file?.path ?? file ?? ""))) ?? null; }

  clearTransition(leaf) {
    try { leaf?.view?.containerEl?.removeClass?.("wrdn-v2-native-transitioning"); }
    catch {}
  }

  schedule(file, leafHint = null) {
    const route = this.routeFor(file);
    if (!route) return;
    const leaf = leafHint || this.plugin.app.workspace.activeLeaf || null;
    const view = leaf?.view;
    if (view?.getViewType?.() === route.viewType) return;
    if (!(view instanceof MarkdownView) || normalizePath(String(view.file?.path || "")) !== route.file) return;

    view.containerEl?.addClass?.("wrdn-v2-native-transitioning");
    const previous = this.pending.get(leaf);
    if (previous?.timer) clearTimeout(previous.timer);
    const generation = Number(previous?.generation ?? 0) + 1;
    const timer = setTimeout(() => {
      const current = this.pending.get(leaf);
      if (!current || current.generation !== generation) return;
      this.pending.delete(leaf);
      void this.commit(leaf, route);
    }, 40);
    this.pending.set(leaf, { generation, timer });
  }

  async commit(leaf, route) {
    if (this.busy.has(leaf)) return;
    const view = leaf?.view;
    if (!(view instanceof MarkdownView) || normalizePath(String(view.file?.path || "")) !== route.file) return;
    this.busy.add(leaf);
    try {
      await leaf.setViewState({ type: route.viewType, active: true, state: { file: route.file } });
    } catch (error) {
      console.error(`[Weread UI V2] 切换 Native 页面失败：${route.file}`, error);

    } finally {
      this.clearTransition(leaf);
      this.busy.delete(leaf);
    }
  }

  dispose() {
    for (const { timer } of this.pending.values()) if (timer) clearTimeout(timer);
    this.pending.clear();
    this.busy.clear();
  }
}

async function installUiRuntime(plugin) {
  const app = plugin.app;
  plugin.dataStore = new ReadingDataStore(plugin);
  plugin.contentStore = new ContentChangeStore();
  plugin.sessionStore = new SessionStore();
  plugin.draftStore = new DraftStore(app);
  plugin.syncController = new SyncController(plugin);
  plugin.textCache = new VaultTextCache(plugin);
  plugin.navigation = new NavigationBridge(app, plugin.sessionStore);

  plugin.registerView(HOME_VIEW_TYPE, (leaf) => new NativeHomeDashboardView(leaf, plugin));
  plugin.registerView(REVIEW_VIEW_TYPE, (leaf) => new NativeReviewCenterView(leaf, plugin));
  plugin.registerView(SHELF_VIEW_TYPE, (leaf) => new NativeShelfView(leaf, plugin));
  plugin.registerView(BOOK_DETAIL_VIEW_TYPE, (leaf) => new NativeBookDetailView(leaf, plugin));
  plugin.registerView(KNOWLEDGE_VIEW_TYPE, (leaf) => new NativeKnowledgeCenterView(leaf, plugin));

  const nativeRouter = new NativeFileViewRouter(plugin, [
    { file: HOME_FILE, viewType: HOME_VIEW_TYPE },
    { file: REVIEW_CENTER_FILE, viewType: REVIEW_VIEW_TYPE },
    { file: SHELF_FILE, viewType: SHELF_VIEW_TYPE },
    { file: BOOK_DETAIL_FILE, viewType: BOOK_DETAIL_VIEW_TYPE },
    { file: KNOWLEDGE_FILE, viewType: KNOWLEDGE_VIEW_TYPE },
  ]);
  plugin.nativeRouter = nativeRouter;

  plugin.registerEvent(app.workspace.on("file-open", (file) => nativeRouter.schedule(file)));
  plugin.registerEvent(app.workspace.on("active-leaf-change", (leaf) => {
    const view = leaf?.view;
    if (view instanceof MarkdownView) nativeRouter.schedule(view.file, leaf);
  }));

  let disposed = false;
  app.workspace.onLayoutReady(() => {
    if (disposed) return;
    const leaf = app.workspace.activeLeaf || null;
    const view = leaf?.view;
    if (view instanceof MarkdownView) nativeRouter.schedule(view.file, leaf);
  });

  const dataEvent = (file) => {
    const filePath = normalizePath(String(file?.path || ""));
    if (filePath === plugin.dataStore.dataPath) plugin.dataStore.scheduleReload("vault-data-change", 200);
    if (filePath === normalizePath(DEFAULT_HOME_STYLE) || filePath === normalizePath(DEFAULT_FUNCTION_STYLE)) {
      plugin.textCache.invalidate(filePath);
      plugin.contentStore.notify(filePath, 120);
    }
    if (filePath === normalizePath(CONFIG_FILE) || filePath.startsWith(`${normalizePath(REVIEW_FOLDER)}/`) || filePath.startsWith(`${normalizePath(BOOK_REVIEW_FOLDER)}/`)) {
      plugin.contentStore.notify(filePath, 120);
    }
  };
  plugin.registerEvent(app.vault.on("modify", dataEvent));
  plugin.registerEvent(app.vault.on("create", dataEvent));
  plugin.registerEvent(app.vault.on("rename", dataEvent));
  plugin.registerEvent(app.vault.on("delete", dataEvent));
  plugin.registerEvent(app.metadataCache.on("changed", (file) => {
    const filePath = normalizePath(String(file?.path || ""));
    if (filePath === normalizePath(CONFIG_FILE) || filePath.startsWith(`${normalizePath(REVIEW_FOLDER)}/`) || filePath.startsWith(`${normalizePath(BOOK_REVIEW_FOLDER)}/`)) plugin.contentStore.notify(filePath, 80);
  }));

  return function disposeUiRuntime() {
    disposed = true;
    nativeRouter.dispose();
    app.workspace.detachLeavesOfType?.(HOME_VIEW_TYPE);
    app.workspace.detachLeavesOfType?.(REVIEW_VIEW_TYPE);
    app.workspace.detachLeavesOfType?.(SHELF_VIEW_TYPE);
    app.workspace.detachLeavesOfType?.(BOOK_DETAIL_VIEW_TYPE);
    app.workspace.detachLeavesOfType?.(KNOWLEDGE_VIEW_TYPE);
    plugin.dataStore?.dispose();
    plugin.contentStore?.dispose();
    plugin.draftStore?.dispose();
    plugin.syncController?.dispose();
  };
}

module.exports = { installUiRuntime };

  })(module, exports, require);
  return module.exports;
})() /* ui-runtime */;
const __WRD_CREATE_PLUGIN = (() => {
  const module = { exports: {} };
  const exports = module.exports;
  ((module, exports, require) => {
"use strict";

const { normalizePath } = require("obsidian");

const TEMPLATE_ROOT = "阅读系统";
const HOME_FILE = `${TEMPLATE_ROOT}/00-阅读看板.md`;

const TEMPLATE_DIRS = [
  "阅读系统",
  "阅读系统/功能页面",
  "阅读系统/配置",
  "阅读系统/_数据",
  "阅读系统/_数据/assets",
  "阅读系统/_数据/assets/covers",
  "阅读系统/_用户数据",
  "阅读系统/_用户数据/书评",
  "阅读系统/_用户数据/阅读回顾",
  "阅读系统/_用户数据/阅读回顾/周",
  "阅读系统/_用户数据/阅读回顾/月",
  "阅读系统/_用户数据/阅读回顾/年",
  "阅读系统/_系统",
];

const TEMPLATE_FILES = [
  "00-阅读看板.md",
  "功能页面/书籍详情.md",
  "功能页面/回顾中心.md",
  "功能页面/完整书架.md",
  "功能页面/知识中心.md",
  "配置/阅读看板配置.md",
  "_系统/首页.css",
  "_系统/功能页面.css",
];

async function ensureVaultFolder(app, folderPath) {
  const parts = normalizePath(folderPath).split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (app.vault.getAbstractFileByPath(current)) continue;
    try {
      await app.vault.createFolder(current);
    } catch (error) {
      if (!app.vault.getAbstractFileByPath(current)) throw error;
    }
  }
}

function validateTemplateBundle(templateBundle) {
  if (!templateBundle || typeof templateBundle !== "object") {
    throw new Error("Weread Reading Dashboard: embedded template bundle missing");
  }
  for (const relative of TEMPLATE_FILES) {
    const entry = templateBundle[relative];
    if (!entry || typeof entry.content !== "string") {
      throw new Error(`Weread Reading Dashboard: embedded template missing: ${relative}`);
    }
    if (entry.mode !== "managed" && entry.mode !== "preserve") {
      throw new Error(`Weread Reading Dashboard: invalid template policy: ${relative}`);
    }
  }
}

async function reconcileTemplateScaffold(plugin, templateBundle) {
  validateTemplateBundle(templateBundle);
  const app = plugin.app;
  for (const folder of TEMPLATE_DIRS) await ensureVaultFolder(app, folder);

  const result = { created: [], preserved: [], customized: [] };

  // reading-data.json is part of the installed project skeleton. Create a
  // schema-valid zero-data snapshot once, before Native UI can mount. Existing
  // valid data is preserved verbatim; invalid existing data fails visibly.
  if (typeof plugin.ensureInitialReadingData !== "function") {
    throw new Error("Weread Reading Dashboard: canonical data bootstrap runtime missing");
  }
  const initialData = await plugin.ensureInitialReadingData();
  if (initialData?.created) result.created.push(normalizePath(initialData.path));
  else if (initialData?.path) result.preserved.push(normalizePath(initialData.path));

  for (const relative of TEMPLATE_FILES) {
    const entry = templateBundle[relative];
    const target = normalizePath(`${TEMPLATE_ROOT}/${relative}`);
    const existing = app.vault.getAbstractFileByPath(target);

    if (!existing) {
      const parent = target.split("/").slice(0, -1).join("/");
      if (parent) await ensureVaultFolder(app, parent);
      try {
        await app.vault.create(target, entry.content);
        result.created.push(target);
      } catch (error) {
        if (app.vault.getAbstractFileByPath(target)) result.preserved.push(target);
        else throw error;
      }
      continue;
    }

    // User-owned configuration is create-only. Never overwrite it on upgrade.
    if (entry.mode === "preserve") {
      result.preserved.push(target);
      continue;
    }

    let currentText;
    try { currentText = await app.vault.read(existing); }
    catch {
      result.customized.push(target);
      continue;
    }

    if (currentText === entry.content) {
      result.preserved.push(target);
      continue;
    }

    // Existing non-matching managed content is user-owned. With a create-or-preserve scaffold policy, keep it instead of maintaining template version fingerprints.
    result.customized.push(target);
  }

  return result;
}


async function openDashboard(plugin) {
  try {
    if (typeof plugin.ensureUiRuntimeReady === "function") await plugin.ensureUiRuntimeReady();
    else if (typeof plugin.ensureProjectScaffold === "function") await plugin.ensureProjectScaffold();
  } catch (error) {
    console.error("[Weread Reading Dashboard] dashboard preflight failed", error);
    return;
  }

  const file = plugin.app.vault.getAbstractFileByPath(normalizePath(HOME_FILE));
  if (!file) {
    console.error(`[Weread Reading Dashboard] 未找到 ${HOME_FILE}。请运行“检查/修复阅读系统模板”。`);
    return;
  }
  await plugin.app.workspace.getLeaf(false).openFile(file);
}

module.exports = function createConsolidatedPlugin(SyncPluginBase, installUiRuntime, templateBundle) {
  if (typeof SyncPluginBase !== "function") throw new Error("Weread consolidated build: invalid sync runtime");
  if (typeof installUiRuntime !== "function") throw new Error("Weread consolidated build: invalid UI runtime installer");
  validateTemplateBundle(templateBundle);

  return class WereadReadingDashboardPlugin extends SyncPluginBase {
    async ensureProjectScaffold() {
      // One authoritative, idempotent project bootstrap. Multiple lifecycle checkpoints may call it,
      // but concurrent calls collapse into the same task. Existing user/runtime data is preserved.
      if (this.templateScaffoldTask) return this.templateScaffoldTask;
      this.templateScaffoldTask = reconcileTemplateScaffold(this, templateBundle)
        .finally(() => { this.templateScaffoldTask = null; });
      return this.templateScaffoldTask;
    }

    getEmbeddedTemplateContent(path) {
      const normalized = normalizePath(String(path || ""));
      const root = `${normalizePath(TEMPLATE_ROOT)}/`;
      if (!normalized.startsWith(root)) return null;
      const relative = normalized.slice(root.length);
      const entry = templateBundle[relative];
      return entry && typeof entry.content === "string" ? entry.content : null;
    }

    async ensureUiRuntimeReady() {
      if (this.disposeUiRuntime) return true;
      if (this.uiRuntimeInstallTask) return this.uiRuntimeInstallTask;

      this.uiRuntimeInstallTask = (async () => {
        // Native views must never be registered before the canonical page/CSS scaffold exists.
        // Otherwise Obsidian may restore a saved Native leaf immediately and mount it against
        // missing managed assets during first-install startup.
        await this.ensureProjectScaffold();
        this.disposeUiRuntime = await installUiRuntime(this);
        return true;
      })().finally(() => { this.uiRuntimeInstallTask = null; });

      return this.uiRuntimeInstallTask;
    }

    async finalizeProjectScaffold() {
      try {
        const result = await this.ensureProjectScaffold();
        const repairedAfterStartupFailure = Boolean(this.templateStartupError);
        this.templateStartupError = null;
        if (repairedAfterStartupFailure && result.created.length) {
          console.info(`[Weread Reading Dashboard] 阅读系统模板已补齐：新建 ${result.created.length} 个。`);
        }
        return result;
      } catch (error) {
        this.templateStartupError = error;
        console.error("[Weread Reading Dashboard] template initialization failed", error);
        return null;
      }
    }

    async onload() {
      this.templateRuntimeUnloaded = false;
      // Load the sync/settings runtime first so the plugin remains usable even if Vault template I/O
      // is temporarily unavailable during Obsidian startup. Template initialization is then attempted
      // immediately and confirmed again at workspace layout-ready using the same idempotent function.
      await super.onload();

      let templateResult = null;
      try {
        templateResult = await this.ensureProjectScaffold();
      } catch (error) {
        this.templateStartupError = error;
        console.warn("[Weread Reading Dashboard] early template initialization deferred until layout-ready", error);
      }

      this.disposeUiRuntime = null;
      if (templateResult) {
        try {
          await this.ensureUiRuntimeReady();
        } catch (error) {
          try { this.disposeUiRuntime?.(); } catch { /* best effort */ }
          try { super.onunload(); } catch { /* best effort */ }
          throw error;
        }
      }

      this.addCommand({
        id: "open-dashboard",
        name: "打开阅读看板",
        callback: () => void openDashboard(this),
      });
      this.addCommand({
        id: "repair-template-scaffold",
        name: "检查/修复阅读系统模板",
        callback: () => void this.ensureProjectScaffold().catch((error) => {
          console.error("[Weread Reading Dashboard] template repair failed", error);
        }),
      });

      // Obsidian may load a plugin before the Vault/Workspace is fully writable.
      // The layout-ready checkpoint reuses the same idempotent reconcile function; it is
      // a lifecycle retry, not a second installer or alternate template path.
      this.app.workspace.onLayoutReady(() => {
        if (this.templateRuntimeUnloaded) return;
        void (async () => {
          const result = await this.finalizeProjectScaffold();
          if (!result) return;
          try { await this.ensureUiRuntimeReady(); }
          catch (error) {
            console.error("[Weread Reading Dashboard] UI runtime deferred install failed", error);

          }
        })();
      });

      // Consolidated single-plugin runtime: no retired companion-plugin control remains.
    }

    onunload() {
      this.templateRuntimeUnloaded = true;
      try { this.disposeUiRuntime?.(); }
      finally { super.onunload(); }
    }
  };
};

  })(module, exports, require);
  return module.exports;
})() /* bootstrap */;
const __WRD_TEMPLATE_BUNDLE = {"00-阅读看板.md":{"mode":"managed","content":"---\n配色: 暖棕\n模板版本: \"Pre02A-R3-All-Native-V2\"\ncssclasses:\n  - wrdn-v2172-page\naliases:\n  - 我的阅读看板\n---\n"},"功能页面/书籍详情.md":{"mode":"managed","content":"---\ntype: wrdn-page\ntemplate_version: \"Pre02A-R3-All-Native-V2\"\npage_mode: book-detail\ncssclasses:\n  - wrdn-functional-page\n---\n"},"功能页面/回顾中心.md":{"mode":"managed","content":"---\ntype: wrdn-page\ntemplate_version: \"Pre02A-R3-All-Native-V2\"\npage_mode: review-center\ncssclasses:\n  - wrdn-functional-page\n---\n"},"功能页面/完整书架.md":{"mode":"managed","content":"---\ntype: wrdn-page\ntemplate_version: \"Pre02A-R3-All-Native-V2\"\npage_mode: shelf\ncssclasses:\n  - wrdn-functional-page\n---\n"},"功能页面/知识中心.md":{"mode":"managed","content":"---\ntype: wrdn-page\ntemplate_version: \"Pre02A-R3-All-Native-V2\"\npage_mode: knowledge-center\ncssclasses:\n  - wrdn-functional-page\n---\n"},"配置/阅读看板配置.md":{"mode":"preserve","content":"---\ntype: reading-config\ndaily_goal_minutes: 30\nsource_book_limit: 4\nreading_field_limit: 6\n---\n\n# 阅读看板配置\n\n本页只保存首页当前仍生效的用户配置。客观阅读数据由本地插件写入 `阅读系统/_数据/reading-data.json`。\n\n- 每日阅读目标：`daily_goal_minutes`\n- 内容来源展示数量：`source_book_limit`\n- 阅读主题展示数量：`reading_field_limit`\n\n阅读时段由当前 Dashboard 统一定义为凌晨 00:00–06:00、上午 06:00–12:00、下午 12:00–18:00、晚上 18:00–24:00，不从本页读取。API Key、阅读时长和统计结果也不会写入本页。\n"},"_系统/首页.css":{"mode":"managed","content":"/* Shadow DOM 宿主 */\n:host{\n  display: block;\n  width: 100%;\n  max-width: none;\n  min-width: 0;\n  overflow: visible;\n  color-scheme: light;\n}\n\n/* 微信读书看板 MVP2.17.1 · 重新打包校验版\n   唯一视觉基线：冻结稿 1024 × 1536。\n   真实 DOM 与自然流式布局；不使用整页图片、固定画布或 transform 缩放。 */\n\n/* Pre-02A R3: retired Markdown/Dataview host selectors removed; this stylesheet now serves Native V2 Shadow DOM only. */\n\n.wrdn-dashboard > .wrdn-header,\n.wrdn-dashboard > .wrdn-top-grid,\n.wrdn-dashboard > .wrdn-second-grid,\n.wrdn-dashboard > .wrdn-shelf,\n.wrdn-dashboard > .wrdn-rhythm{\n  display: grid;\n  visibility: visible;\n  opacity: 1;\n}\n\n.wrdn-dashboard > .wrdn-header{\n  display: flex;\n}\n\n.wrdn-render-error{\n  min-height: 160px;\n  padding: 18px;\n  border-color: #d98c8c;\n}\n\n.wrdn-render-error-message{\n  margin: 14px 0 0;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n  color: #8b2f2f;\n  font-size: 11px;\n}\n\n.wrdn-dashboard{\n  --wrdn-page: #fbfaf7;\n  --wrdn-panel: rgba(255, 255, 255, 0.92);\n  --wrdn-card: #fffdfa;\n  --wrdn-soft: #fbf7f1;\n  --wrdn-soft-2: #f7efe5;\n  --wrdn-border: #eee7df;\n  --wrdn-border-strong: #e4d9ce;\n  --wrdn-text: #24211f;\n  --wrdn-muted: #78716b;\n  --wrdn-faint: #aaa29a;\n  --wrdn-accent: #7b4f29;\n  --wrdn-accent-strong: #68401f;\n  --wrdn-accent-soft: #f6eadc;\n  --wrdn-green: #3d9a5f;\n  --wrdn-shadow: 0 5px 22px rgba(75, 54, 35, 0.035);\n  --wrdn-review-field-font: 10px;\n  --wrdn-review-field-line: 1.62;\n\n  container: weread-dashboard / inline-size;\n  width: min(100%, 1024px);\n  min-width: 0;\n  margin: 0 auto;\n  padding: 18px;\n  background: var(--wrdn-page);\n  color: var(--wrdn-text);\n  font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", \"Noto Sans CJK SC\", var(--font-interface, sans-serif);\n  line-height: 1.45;\n}\n\n.wrdn-dashboard,\n.wrdn-dashboard *,\n.wrdn-dashboard *::before,\n.wrdn-dashboard *::after{\n  box-sizing: border-box;\n}\n\n.wrdn-dashboard [hidden]{\n  display: none !important;\n}\n\n.wrdn-dashboard button,\n.wrdn-dashboard input,\n.wrdn-dashboard select,\n.wrdn-dashboard textarea{\n  font: inherit;\n}\n\n.wrdn-dashboard button{\n  appearance: none !important;\n  -webkit-appearance: none !important;\n  margin: 0 !important;\n  box-shadow: none !important;\n}\n\n.wrdn-panel{\n  position: relative;\n  min-width: 0;\n  overflow: hidden;\n  border: 1px solid var(--wrdn-border);\n  border-radius: 12px;\n  background: var(--wrdn-panel);\n  box-shadow: var(--wrdn-shadow);\n}\n\n.wrdn-clickable{\n  cursor: pointer;\n}\n\n.wrdn-clickable:focus-visible,\n.wrdn-dashboard button:focus-visible{\n  outline: 2px solid rgba(123, 79, 41, 0.35);\n  outline-offset: 2px;\n}\n\n.wrdn-icon{\n  display: inline-flex;\n  width: 18px;\n  height: 18px;\n  flex: 0 0 auto;\n  align-items: center;\n  justify-content: center;\n  color: currentColor;\n}\n\n.wrdn-icon svg{\n  display: block;\n  width: 100%;\n  height: 100%;\n}\n\n/* 顶部标题栏 */\n.wrdn-header{\n  display: flex;\n  height: 58px;\n  align-items: center;\n  justify-content: space-between;\n  padding: 0 20px;\n  margin-bottom: 12px;\n}\n\n.wrdn-header-left,\n.wrdn-header-right{\n  display: flex;\n  min-width: 0;\n  align-items: center;\n}\n\n.wrdn-header-left{\n  gap: 12px;\n}\n\n.wrdn-logo{\n  display: flex;\n  width: 32px;\n  height: 32px;\n  flex: 0 0 auto;\n  align-items: center;\n  justify-content: center;\n  border-radius: 5px;\n  background: var(--wrdn-accent);\n  color: #fff;\n}\n\n.wrdn-logo .wrdn-icon{\n  width: 20px;\n  height: 20px;\n}\n\n.wrdn-main-title{\n  margin: 0;\n  font-size: 22px;\n  font-weight: 760;\n  line-height: 1;\n  letter-spacing: -0.025em;\n}\n\n\n\n\n\n.wrdn-header-right{\n  gap: 8px;\n  font-size: 15px;\n  white-space: nowrap;\n}\n\n.wrdn-header-right .wrdn-icon{\n  width: 17px;\n  height: 17px;\n}\n\n\n\n/* 第一、二行固定比例 */\n.wrdn-top-grid,\n.wrdn-second-grid{\n  display: grid;\n  grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr);\n  gap: 12px;\n  margin-bottom: 12px;\n}\n\n.wrdn-section-title{\n  margin: 0;\n  color: var(--wrdn-text);\n  font-size: 17px;\n  font-weight: 720;\n  line-height: 20px;\n  letter-spacing: -0.015em;\n}\n\n.wrdn-section-heading{\n  display: flex;\n  width: 100%;\n  min-width: 0;\n  min-height: 30px;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n}\n\n/* 今日阅读 */\n.wrdn-today{\n  min-height: 326px;\n  padding: 17px 16px 18px;\n}\n\n.wrdn-today-body{\n  display: grid;\n  grid-template-columns: 138px minmax(0, 1fr) 1px 176px;\n  gap: 24px;\n  align-items: start;\n  margin-top: 16px;\n  padding: 0 8px 2px;\n}\n\n.wrdn-main-cover-wrap{\n  width: 138px;\n  height: 219px;\n  overflow: hidden;\n  border-radius: 8px;\n  box-shadow: 0 8px 18px rgba(29, 24, 18, 0.16);\n}\n\n.wrdn-main-cover{\n  display: block;\n  width: 100%;\n  height: 100%;\n  background-position: center;\n  background-repeat: no-repeat;\n  background-size: cover;\n}\n\n.wrdn-book-info{\n  display: flex;\n  min-width: 0;\n  min-height: 219px;\n  align-self: start;\n  padding-top: 2px;\n  flex-direction: column;\n}\n\n.wrdn-book-name{\n  overflow: hidden;\n  font-size: 21px;\n  font-weight: 720;\n  line-height: 1.25;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.wrdn-book-en{\n  margin-top: 2px;\n  color: #49433e;\n  font-size: 13px;\n}\n\n.wrdn-book-author{\n  margin-top: 8px;\n  font-size: 13px;\n}\n\n.wrdn-status-chip,\n.wrdn-book-badge{\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  border-radius: 999px;\n  background: var(--wrdn-accent-soft);\n  color: var(--wrdn-accent);\n}\n\n.wrdn-status-chip{\n  min-height: 22px;\n  margin-top: 13px;\n  padding: 0 10px;\n  font-size: 11px;\n}\n\n.wrdn-current-label{\n  margin-top: 28px;\n  color: var(--wrdn-muted);\n  font-size: 11px;\n}\n\n.wrdn-current-num{\n  margin-top: 2px;\n  font-size: 30px;\n  font-weight: 520;\n  line-height: 1;\n}\n\n.wrdn-current-num span{\n  margin-left: 2px;\n  font-size: 16px;\n}\n\n.wrdn-progress,\n.wrdn-book-progress{\n  display: block;\n  overflow: hidden;\n  border-radius: 999px;\n  background: #efe6da;\n}\n\n.wrdn-progress{\n  width: 100%;\n  height: 8px;\n  margin-top: 10px;\n}\n\n.wrdn-progress i,\n.wrdn-book-progress i{\n  display: block;\n  height: 100%;\n  border-radius: inherit;\n  background: var(--wrdn-accent);\n}\n\n\n\n.wrdn-last-read{\n  width: 100%;\n  max-width: 100%;\n  min-width: 0;\n  margin-top: 12px;\n  color: var(--wrdn-muted);\n  font-size: 12px;\n  line-height: 1.45;\n  white-space: normal;\n  overflow-wrap: anywhere;\n  word-break: break-word;\n}\n\n.wrdn-today-rule{\n  width: 1px;\n  height: 219px;\n  background: var(--wrdn-border);\n}\n\n.wrdn-goal{\n  display: flex;\n  min-width: 0;\n  min-height: 219px;\n  align-self: start;\n  align-items: center;\n  justify-content: flex-start;\n  flex-direction: column;\n  padding: 1px 0 0;\n}\n\n.wrdn-primary{\n  display: inline-flex !important;\n  align-items: center;\n  justify-content: center;\n  border-radius: 5px !important;\n  cursor: pointer;\n}\n\n.wrdn-primary{\n  width: 160px;\n  max-width: 100%;\n  min-height: 36px;\n  margin-top: 18px !important;\n  padding: 0 16px !important;\n  border: 1px solid var(--wrdn-accent) !important;\n  background: var(--wrdn-accent) !important;\n  color: #fff !important;\n  font-size: 12px !important;\n  font-weight: 650 !important;\n}\n\n.wrdn-primary:hover{\n  border-color: var(--wrdn-accent-strong) !important;\n  background: var(--wrdn-accent-strong) !important;\n}\n\n/* 第二行 */\n.wrdn-insights,\n.wrdn-review{\n  min-height: 394px;\n  padding: 16px;\n}\n\n.wrdn-insight-grid{\n  display: grid;\n  height: 302px;\n  grid-template-columns: 1fr 1.18fr 1fr;\n  gap: 12px;\n  margin-top: 16px;\n}\n\n.wrdn-inner-card{\n  position: relative;\n  min-width: 0;\n  overflow: hidden;\n  padding: 16px 13px 14px;\n  border: 1px solid var(--wrdn-border);\n  border-radius: 8px;\n  background: #fffdfa;\n}\n\n.wrdn-inner-title{\n  margin: 0;\n  font-size: 11px;\n  font-weight: 680;\n}\n\n.wrdn-all-books{\n  color: var(--wrdn-accent);\n  font-size: 12px;\n  font-weight: 600;\n}\n\n/* MVP3.5：知识与洞察视觉重构 */\n.wrdn-asset-metrics{\n  display: grid;\n  gap: 10px;\n  margin-top: 15px;\n}\n\n.wrdn-asset-metric{\n  display: grid;\n  grid-template-columns: 42px minmax(0, 1fr);\n  gap: 11px;\n  align-items: center;\n  min-height: 89px;\n  padding: 11px 12px;\n  border: 1px solid color-mix(in srgb, var(--wrdn-border) 90%, transparent);\n  border-radius: 9px;\n  background: #fffdfa;\n  box-shadow: 0 5px 14px rgba(97, 67, 39, 0.035);\n}\n\n.wrdn-asset-metric-icon{\n  display: grid;\n  width: 42px;\n  height: 42px;\n  place-items: center;\n  border-radius: 50%;\n  background: #f7eee3;\n  color: var(--wrdn-accent);\n}\n\n.wrdn-asset-metric-icon .wrdn-icon{\n  width: 23px;\n  height: 23px;\n}\n\n.wrdn-asset-metric-copy{\n  min-width: 0;\n}\n\n.wrdn-asset-metric-label{\n  color: var(--wrdn-text);\n  font-size: 12px;\n  font-weight: 620;\n  line-height: 1.25;\n  white-space: nowrap;\n}\n\n.wrdn-asset-metric-value{\n  margin-top: 5px;\n  color: var(--wrdn-text);\n  font-size: 26px;\n  font-weight: 560;\n  line-height: 1;\n  white-space: nowrap;\n}\n\n.wrdn-asset-metric-value small{\n  margin-left: 4px;\n  color: var(--wrdn-text);\n  font-size: 9px;\n  font-weight: 520;\n}\n\n.wrdn-source-book-list{\n  display: grid;\n  gap: 0;\n  margin-top: 18px;\n}\n\n.wrdn-source-book-row{\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) auto;\n  gap: 12px;\n  align-items: center;\n  min-height: 43px;\n  border-bottom: 1px solid color-mix(in srgb, var(--wrdn-border) 72%, transparent);\n  font-size: 11px;\n  cursor: pointer;\n}\n\n.wrdn-source-book-row:last-child{\n  border-bottom: 0;\n}\n\n.wrdn-source-book-row:hover{\n  color: var(--wrdn-accent);\n}\n\n.wrdn-source-book-name{\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.wrdn-source-book-row strong{\n  color: var(--wrdn-text);\n  font-size: 13px;\n  font-weight: 600;\n  white-space: nowrap;\n}\n\n.wrdn-reading-theme-chips{\n  display: flex;\n  flex-wrap: wrap;\n  align-content: flex-start;\n  gap: 8px 7px;\n  min-height: 88px;\n  margin-top: 17px;\n}\n\n.wrdn-reading-theme-chip{\n  display: inline-flex;\n  min-width: 0;\n  align-items: center;\n  gap: 6px;\n  padding: 7px 10px;\n  border-radius: 999px;\n  background: #f7eee3;\n  color: var(--wrdn-accent);\n  font-size: 9.5px;\n  line-height: 1;\n  white-space: nowrap;\n  cursor: pointer;\n  transition: background .15s ease, transform .15s ease;\n}\n\n.wrdn-reading-theme-chip:hover{\n  background: #f1e2d1;\n  transform: translateY(-1px);\n}\n\n.wrdn-reading-theme-chip strong{\n  font-size: 9px;\n  font-weight: 650;\n}\n\n.wrdn-reading-theme-network{\n  position: absolute;\n  right: 17px;\n  bottom: 41px;\n  width: 74px;\n  height: 74px;\n  color: #e4c7a4;\n  opacity: .92;\n}\n\n.wrdn-reading-theme-network svg{\n  display: block;\n  width: 100%;\n  height: 100%;\n}\n\n.wrdn-knowledge-empty{\n  padding-top: 20px;\n  color: var(--wrdn-muted);\n  font-size: 13px;\n  line-height: 1.6;\n}\n\n/* 回顾 */\n.wrdn-review-tabs{\n  display: flex;\n  gap: 10px;\n  margin-top: 10px;\n}\n\n.wrdn-tab{\n  min-height: 29px;\n  padding: 0 13px !important;\n  border: 0 !important;\n  border-radius: 6px !important;\n  background: #f5f1ec !important;\n  color: var(--wrdn-muted) !important;\n  font-size: 10px !important;\n  cursor: pointer;\n}\n\n.wrdn-tab.is-active{\n  background: var(--wrdn-accent) !important;\n  color: #fff !important;\n}\n\n.wrdn-review-panels{\n  margin-top: 14px;\n}\n\n.wrdn-review-head{\n  font-size: 12px;\n  font-weight: 680;\n}\n\n.wrdn-review-head small{\n  color: var(--wrdn-muted);\n  font-weight: 500;\n}\n\n.wrdn-review-metrics{\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  margin-top: 11px;\n  border: 1px solid var(--wrdn-border);\n  border-radius: 7px;\n}\n\n.wrdn-review-metrics > div{\n  display: flex;\n  min-width: 0;\n  height: 58px;\n  align-items: center;\n  justify-content: center;\n  flex-direction: column;\n  border-right: 1px solid var(--wrdn-border);\n}\n\n.wrdn-review-metrics > div:last-child{\n  border-right: 0;\n}\n\n.wrdn-review-metrics b{\n  font-size: 17px;\n  font-weight: 560;\n}\n\n.wrdn-review-metrics b span{\n  margin-left: 2px;\n  font-size: 9px;\n  font-weight: 500;\n}\n\n.wrdn-review-metrics small{\n  margin-top: 3px;\n  color: var(--wrdn-muted);\n  font-size: 8px;\n}\n\n.wrdn-review-subtitle{\n  margin-top: 14px;\n  font-size: 12px;\n  font-weight: 680;\n}\n\n.wrdn-focus-list{\n  margin: 7px 0 0;\n  padding-left: 18px;\n  font-size: var(--wrdn-review-field-font);\n  line-height: var(--wrdn-review-field-line);\n}\n\n.wrdn-focus-list{\n  list-style: disc;\n}\n\n.wrdn-user-field{\n  border-radius: 6px;\n  transition: background 120ms ease, box-shadow 120ms ease;\n}\n\n.wrdn-user-field:hover,\n.wrdn-user-field:focus-visible{\n  background: rgba(123, 79, 41, 0.045);\n  box-shadow: 0 0 0 4px rgba(123, 79, 41, 0.045);\n}\n\n.wrdn-empty-value{\n  color: var(--wrdn-faint) !important;\n}\n\n.wrdn-note-box{\n  display: flex;\n  margin-top: 12px;\n  padding: 10px 12px;\n  border: 1px solid var(--wrdn-border);\n  border-radius: 7px;\n  background: var(--wrdn-soft-2);\n  flex-direction: column;\n  gap: 3px;\n}\n\n.wrdn-note-box b{\n  font-size: 8.8px;\n}\n\n.wrdn-note-box span{\n  display: -webkit-box;\n  overflow: hidden;\n  font-size: var(--wrdn-review-field-font);\n  line-height: var(--wrdn-review-field-line);\n  text-overflow: ellipsis;\n  white-space: normal;\n  -webkit-box-orient: vertical;\n  -webkit-line-clamp: 2;\n}\n\n.wrdn-user-field{\n  cursor: text;\n}\n\n.wrdn-user-field.is-editing{\n  display: flex;\n  margin-top: 8px;\n  padding: 10px;\n  border: 1px solid var(--wrdn-border-strong);\n  border-radius: 8px;\n  background: #fffdfa;\n  box-shadow: 0 0 0 3px rgba(123, 79, 41, 0.05);\n  flex-direction: column;\n  gap: 7px;\n}\n\n.wrdn-inline-input{\n  width: 100%;\n  min-height: 34px;\n  resize: vertical;\n  padding: 8px 9px;\n  border: 1px solid var(--wrdn-border);\n  border-radius: 6px;\n  outline: none;\n  background: #fff;\n  color: var(--wrdn-text);\n  font-family: inherit !important;\n  font-size: var(--wrdn-review-field-font) !important;\n  font-weight: 400 !important;\n  line-height: var(--wrdn-review-field-line) !important;\n}\n\n.wrdn-inline-input:focus{\n  border-color: #c8aa8b;\n  box-shadow: 0 0 0 2px rgba(123, 79, 41, 0.08);\n}\n\n.wrdn-inline-input-tall,\n.wrdn-inline-input-gain{\n  min-height: 72px;\n}\n\n.wrdn-inline-actions{\n  display: flex;\n  justify-content: flex-end;\n  gap: 7px;\n}\n\n.wrdn-inline-save,\n.wrdn-inline-cancel{\n  min-height: 27px;\n  padding: 0 11px !important;\n  border-radius: 5px !important;\n  font-size: 9.5px !important;\n  cursor: pointer;\n}\n\n.wrdn-inline-save{\n  border: 1px solid var(--wrdn-accent) !important;\n  background: var(--wrdn-accent) !important;\n  color: #fff !important;\n}\n\n.wrdn-inline-cancel{\n  border: 1px solid var(--wrdn-border-strong) !important;\n  background: #fff !important;\n  color: var(--wrdn-muted) !important;\n}\n\n/* 书架 */\n.wrdn-shelf{\n  display: block !important;\n  min-height: 244px;\n  padding: 14px 15px 13px;\n  margin-bottom: 12px;\n}\n\n.wrdn-shelf .wrdn-section-heading{\n  min-height: 27px;\n  align-items: center;\n  justify-content: flex-start;\n}\n\n.wrdn-shelf .wrdn-section-title{\n  display: block;\n  line-height: 27px;\n}\n\n.wrdn-filter-row{\n  position: static;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  margin-left: 32px;\n}\n\n.wrdn-shelf .wrdn-all-books{\n  margin-left: auto !important;\n}\n\n.wrdn-filter{\n  min-height: 27px;\n  padding: 0 13px !important;\n  border: 0 !important;\n  border-radius: 999px !important;\n  background: #f5f1ec !important;\n  color: var(--wrdn-muted) !important;\n  font-size: 9.5px !important;\n  cursor: pointer;\n}\n\n.wrdn-filter.is-active{\n  background: var(--wrdn-accent) !important;\n  color: #fff !important;\n}\n\n.wrdn-all-books{\n  flex: 0 0 auto;\n}\n\n.wrdn-book-row{\n  display: grid;\n  grid-template-columns: repeat(6, minmax(0, 1fr));\n  gap: 8px;\n  margin-top: 15px;\n}\n\n.wrdn-book-row-empty{\n  grid-column: 1 / -1;\n}\n\n.wrdn-book-card{\n  min-width: 0;\n  height: 183px;\n  padding: 12px 10px 9px;\n  border: 1px solid var(--wrdn-border);\n  border-radius: 8px;\n  background: #fffdfa;\n}\n\n.wrdn-book-card[hidden]{\n  display: none !important;\n}\n\n.wrdn-book-top{\n  display: grid;\n  grid-template-columns: 47px minmax(0, 1fr);\n  gap: 9px;\n}\n\n.wrdn-book-cover{\n  display: block;\n  width: 47px;\n  height: 74px;\n  flex: 0 0 auto;\n  background-position: center;\n  background-repeat: no-repeat;\n  background-size: cover;\n  border-radius: 3px;\n  box-shadow: 0 3px 7px rgba(33, 28, 23, 0.14);\n}\n\n.wrdn-main-cover.is-fallback,\n.wrdn-book-cover.is-fallback{\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 8px;\n  background: #0a1b28;\n  color: #d9b675;\n  text-align: center;\n}\n\n.wrdn-cover-fallback-title{\n  font-size: 13px;\n  font-weight: 650;\n  line-height: 1.4;\n}\n\n.wrdn-main-cover .wrdn-cover-fallback-title{\n  font-size: 15px;\n}\n\n.wrdn-book-card-content{\n  min-width: 0;\n}\n\n.wrdn-book-title{\n  overflow: hidden;\n  min-height: 30px;\n  font-size: 10.2px;\n  font-weight: 650;\n  line-height: 1.45;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.wrdn-book-progress-line{\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-top: 15px;\n}\n\n.wrdn-book-progress-line b{\n  flex: 0 0 auto;\n  font-size: 13px;\n  font-weight: 560;\n}\n\n.wrdn-book-progress{\n  height: 6px;\n  flex: 1;\n}\n\n.wrdn-book-foot{\n  margin-top: 11px;\n  color: #4f4944;\n  font-size: 9px;\n  line-height: 1.7;\n}\n\n.wrdn-book-badge{\n  min-height: 21px;\n  margin-top: 6px;\n  padding: 0 8px;\n  font-size: 8.6px;\n}\n\n.wrdn-book-badge.paused{\n  background: #efedf4;\n  color: #777083;\n}\n\n.wrdn-book-badge.focus{\n  background: #fff1d6;\n  color: #bb7418;\n}\n\n.wrdn-book-badge.done{\n  background: #edf4ec;\n  color: #537451;\n}\n\n\n/* 阅读节奏 */\n.wrdn-rhythm{\n  min-height: 291px;\n  padding: 14px 15px 0;\n}\n\n.wrdn-chart-grid{\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 12px;\n  margin-top: 14px;\n}\n\n.wrdn-chart{\n  position: relative;\n  min-width: 0;\n  height: 229px;\n  padding: 14px 13px 10px;\n  border: 1px solid var(--wrdn-border);\n  border-radius: 8px;\n  background: #fffdfa;\n}\n\n.wrdn-chart-title{\n  margin: 0;\n  font-size: 12px;\n  font-weight: 680;\n}\n\n.wrdn-chart-title-row{\n  display: flex;\n  width: 100%;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n}\n\n.wrdn-help{\n  position: relative;\n  display: inline-flex;\n  flex: 0 0 auto;\n}\n\n.wrdn-help-button{\n  display: inline-flex !important;\n  width: 18px;\n  height: 18px;\n  align-items: center;\n  justify-content: center;\n  padding: 0 !important;\n  border: 1px solid var(--wrdn-border-strong) !important;\n  border-radius: 50% !important;\n  background: #fffdfa !important;\n  color: var(--wrdn-muted) !important;\n  font-size: 10px !important;\n  font-weight: 700 !important;\n  cursor: help;\n}\n\n.wrdn-help-tooltip{\n  position: absolute;\n  top: 25px;\n  right: 0;\n  z-index: 20;\n  display: none;\n  width: 150px;\n  padding: 10px 11px;\n  border: 1px solid var(--wrdn-border-strong);\n  border-radius: 7px;\n  background: #fffdfa;\n  box-shadow: 0 10px 24px rgba(52, 42, 31, 0.12);\n  color: var(--wrdn-text);\n  font-size: 8.5px;\n  line-height: 1.65;\n}\n\n.wrdn-help-tooltip b,\n.wrdn-help-tooltip span{\n  display: block;\n}\n\n.wrdn-help-tooltip b{\n  margin-bottom: 4px;\n  font-size: 9px;\n}\n\n.wrdn-help:hover .wrdn-help-tooltip,\n.wrdn-help:focus-within .wrdn-help-tooltip{\n  display: block;\n}\n\n.wrdn-months{\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  margin: 12px 0 5px 36px;\n  color: var(--wrdn-muted);\n  font-size: 8.5px;\n  text-align: center;\n}\n\n.wrdn-weekdays{\n  position: absolute;\n  top: 61px;\n  left: 13px;\n  display: flex;\n  height: 112px;\n  justify-content: space-between;\n  flex-direction: column;\n  color: var(--wrdn-muted);\n  font-size: 8px;\n}\n\n.wrdn-heat-grid{\n  display: grid;\n  height: 115px;\n  grid-auto-flow: column;\n  grid-template-rows: repeat(7, 1fr);\n  grid-auto-columns: 1fr;\n  gap: 3px;\n  margin-left: 35px;\n}\n\n.wrdn-heat-cell,\n.wrdn-heat-legend i{\n  display: block;\n  border-radius: 2px;\n}\n\n.wrdn-heat-cell{\n  min-width: 0;\n  min-height: 0;\n}\n\n.wrdn-heat-cell.is-spacer{ visibility: hidden; }\n.wrdn-heat-cell.is-future{ opacity: .38; }\n.wrdn-heat-cell.is-today{ outline: 1px solid currentColor; }\n\n.wrdn-heat-cell.level-0,\n.wrdn-heat-legend i.level-0{ background: #f3ede4; }\n.wrdn-heat-cell.level-1,\n.wrdn-heat-legend i.level-1{ background: #ead8c1; }\n.wrdn-heat-cell.level-2,\n.wrdn-heat-legend i.level-2{ background: #d8b38a; }\n.wrdn-heat-cell.level-3,\n.wrdn-heat-legend i.level-3{ background: #b88759; }\n.wrdn-heat-cell.level-4,\n.wrdn-heat-legend i.level-4{ background: #7c532f; }\n\n.wrdn-heat-legend{\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 4px;\n  margin-top: 9px;\n  color: var(--wrdn-muted);\n  font-size: 8px;\n}\n\n.wrdn-heat-legend i{\n  width: 12px;\n  height: 8px;\n}\n\n.wrdn-heat-meta{\n  display: flex;\n  justify-content: space-between;\n  margin-top: 10px;\n  color: var(--wrdn-muted);\n  font-size: 8.7px;\n}\n\n.wrdn-trend-svg{\n  display: block;\n  width: 100%;\n  height: 148px;\n  margin-top: 6px;\n}\n\n.wrdn-grid-lines{\n  stroke: #eee8e1;\n  stroke-width: 1;\n}\n\n.wrdn-axis-labels{\n  fill: #7b7772;\n  font-size: 8px;\n}\n\n.wrdn-line-path{\n  fill: none;\n  stroke: #83562e;\n  stroke-width: 1.7;\n}\n\n.wrdn-trend-dot{\n  fill: #83562e;\n  cursor: pointer;\n}\n\n.wrdn-trend-note,\n.wrdn-time-total{\n  height: 27px;\n  border-radius: 5px;\n  background: var(--wrdn-soft-2);\n  color: #736b64;\n  font-size: 8.6px;\n  line-height: 27px;\n  text-align: center;\n}\n\n.wrdn-trend-note{\n  margin-top: -4px;\n}\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n.wrdn-time-total{\n  margin-top: 8px;\n}\n\n.wrdn-footer{\n  display: flex;\n  height: 35px;\n  align-items: center;\n  justify-content: space-between;\n  margin: 10px -15px 0;\n  padding: 0 15px;\n  border-top: 1px solid var(--wrdn-border);\n  color: var(--wrdn-muted);\n  font-size: 8.5px;\n}\n\n.wrdn-footer-left{\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  white-space: nowrap;\n}\n\n.wrdn-footer .wrdn-icon{\n  width: 14px;\n  height: 14px;\n  color: #c18335;\n}\n\n\n\n/* 冻结稿宽度附近保持原排版；窄屏只做必要折行，不改变桌面视觉。 */\n@container weread-dashboard (max-width: 860px) {\n  .wrdn-top-grid,\n.wrdn-second-grid{\n    grid-template-columns: 1fr;\n  }\n\n  .wrdn-today,\n.wrdn-insights,\n.wrdn-review{\n    min-height: auto;\n  }\n\n  .wrdn-book-row{\n    grid-template-columns: repeat(3, minmax(0, 1fr));\n  }\n\n  .wrdn-shelf{\n    min-height: auto;\n  }\n\n  .wrdn-chart-grid{\n    grid-template-columns: 1fr;\n  }\n\n  .wrdn-chart{\n    height: auto;\n    min-height: 229px;\n  }\n\n  .wrdn-rhythm{\n    min-height: auto;\n  }\n}\n\n@container weread-dashboard (max-width: 590px) {\n  .wrdn-dashboard{\n    padding: 10px;\n  }\n\n  .wrdn-header{\n    padding: 0 13px;\n  }\n\n  .wrdn-header-right .wrdn-icon{\n    display: none;\n  }\n\n  .wrdn-main-title{\n    font-size: 19px;\n  }\n\n  .wrdn-today-body{\n    grid-template-columns: 105px minmax(0, 1fr);\n    gap: 13px;\n  }\n\n  .wrdn-main-cover-wrap{\n    width: 105px;\n    height: 167px;\n  }\n\n  .wrdn-today-rule,\n.wrdn-goal{\n    display: none;\n  }\n\n  .wrdn-insight-grid{\n    height: auto;\n    grid-template-columns: 1fr;\n  }\n\n  .wrdn-inner-card{\n    min-height: 240px;\n  }\n\n  .wrdn-filter-row{\n    overflow-x: auto;\n    margin-top: 0;\n    margin-left: 12px;\n  }\n\n  .wrdn-book-row{\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n\n  .wrdn-review-metrics{\n    grid-template-columns: repeat(2, 1fr);\n  }\n\n  .wrdn-review-metrics > div:nth-child(2){\n    border-right: 0;\n  }\n\n  .wrdn-review-metrics > div:nth-child(-n + 2){\n    border-bottom: 1px solid var(--wrdn-border);\n  }\n}\n\n/* MVP2.6：严格复刻用户冻结参考图中的「今日阅读」与「阅读时段分布」。 */\n.wrdn-today{\n  min-height: 357px;\n  padding: 13px 15px 15px;\n}\n\n.wrdn-today-heading{\n  height: 30px;\n  padding: 0 0 9px;\n  border-bottom: 1px solid var(--wrdn-border);\n}\n\n.wrdn-today-body{\n  grid-template-columns: 140px minmax(0, 1fr) 1px 224px;\n  gap: 20px;\n  align-items: stretch;\n  margin-top: 14px;\n  padding: 0;\n}\n\n.wrdn-main-cover-wrap{\n  width: 140px;\n  height: 223px;\n  border-radius: 7px;\n}\n\n.wrdn-book-info{\n  min-height: 223px;\n  padding-top: 2px;\n}\n\n.wrdn-book-name{\n  font-size: 20px;\n  line-height: 1.2;\n}\n\n.wrdn-book-en{\n  margin-top: 3px;\n  font-size: 12px;\n}\n\n.wrdn-book-author{\n  margin-top: 7px;\n  font-size: 12px;\n}\n\n.wrdn-status-chip{\n  align-self: flex-start;\n  min-height: 20px;\n  margin-top: 11px;\n  padding: 0 9px;\n  font-size: 10px;\n}\n\n.wrdn-book-meta-rule{\n  width: 100%;\n  height: 1px;\n  margin-top: 11px;\n  background: var(--wrdn-border);\n}\n\n.wrdn-current-label{\n  margin-top: 10px;\n  font-size: 10px;\n}\n\n.wrdn-current-num{\n  margin-top: 2px;\n  font-size: 29px;\n}\n\n.wrdn-current-num span{\n  font-size: 15px;\n}\n\n.wrdn-progress{\n  height: 7px;\n  margin-top: 8px;\n}\n\n.wrdn-last-read{\n  width: 100%;\n  max-width: 100%;\n  min-width: 0;\n  margin-top: 10px;\n  font-size: 9.5px;\n  line-height: 1.35;\n  white-space: normal;\n  overflow-wrap: anywhere;\n  word-break: break-word;\n}\n\n.wrdn-today-rule{\n  height: 223px;\n  align-self: stretch;\n}\n\n.wrdn-goal{\n  min-height: 223px;\n  padding-top: 0;\n}\n\n\n\n\n\n\n\n\n\n\n\n\n\n.wrdn-primary{\n  width: 158px;\n  min-height: 34px;\n  margin-top: 10px !important;\n  font-size: 11px !important;\n}\n\n\n\n\n\n\n\n\n\n.wrdn-chart.wrdn-time-chart{\n  height: 269px;\n  padding: 13px 14px 0;\n}\n\n.wrdn-time-chart .wrdn-chart-title{\n  font-size: 11px;\n  line-height: 1.2;\n}\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n/* MVP2.6.1：根据冻结截图逐项校准垂直节奏。 */\n.wrdn-current-num{\n  font-size: 42px;\n}\n\n.wrdn-progress{\n  margin-top: 10px;\n}\n\n.wrdn-last-read{\n  margin-top: 13px;\n}\n\n.wrdn-primary{\n  margin-top: 34px !important;\n}\n\n\n\n\n\n\n\n\n/* MVP2.6.2：冻结截图坐标终校。 */\n.wrdn-today-body{\n  margin-top: 19px;\n}\n\n.wrdn-book-info{\n  padding-top: 8px;\n}\n\n.wrdn-dashboard .wrdn-primary{\n  margin-top: 24px !important;\n}\n\n/* MVP2.8：阅读时段分布——恢复统计周期与时段说明，并清除删除装饰入口后留下的空白。 */\n.wrdn-chart.wrdn-time-chart{\n  display: flex;\n  height: 229px;\n  min-height: 229px;\n  flex-direction: column;\n  padding: 14px 13px 12px;\n}\n\n.wrdn-time-title-row{\n  justify-content: flex-start;\n  gap: 8px;\n  min-height: 20px;\n}\n\n.wrdn-time-title-row .wrdn-chart-title{\n  flex: 0 1 auto;\n  font-size: 12px;\n  line-height: 18px;\n  white-space: nowrap;\n}\n\n.wrdn-time-title-row .wrdn-help{\n  flex: 0 0 auto;\n}\n\n.wrdn-time-title-row .wrdn-help-button{\n  width: 18px;\n  height: 18px;\n  font-size: 10px !important;\n  line-height: 16px;\n}\n\n.wrdn-time-title-row .wrdn-help-tooltip{\n  top: 24px;\n  right: auto;\n  left: -8px;\n  width: 164px;\n}\n\n.wrdn-help.is-open .wrdn-help-tooltip{\n  display: block;\n}\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n@container weread-dashboard (max-width: 860px) {\n  .wrdn-chart.wrdn-time-chart{\n    height: auto;\n    min-height: 229px;\n  }\n\n  \n}\n\n\n/* MVP2.9：统一周回顾字段字号；将阅读时段恢复为冻结稿的紧凑构图。 */\n.wrdn-focus-list,\n.wrdn-note-box > span,\n.wrdn-inline-input{\n  font-size: var(--wrdn-review-field-font) !important;\n  font-weight: 400 !important;\n  line-height: var(--wrdn-review-field-line) !important;\n  letter-spacing: 0 !important;\n}\n\n.wrdn-focus-list > li,\n.wrdn-note-box > span{\n  font-size: inherit !important;\n  font-weight: inherit !important;\n  line-height: inherit !important;\n}\n\n.wrdn-note-box > span{\n  display: block;\n  overflow: visible;\n  text-overflow: clip;\n  white-space: normal;\n  -webkit-box-orient: initial;\n  -webkit-line-clamp: unset;\n}\n\n.wrdn-inline-input-tall,\n.wrdn-inline-input-gain{\n  min-height: 72px;\n}\n\n.wrdn-chart.wrdn-time-chart{\n  display: grid;\n  height: 229px;\n  min-height: 229px;\n  grid-template-rows: 20px minmax(0, 1fr) 27px;\n  padding: 14px 13px 10px;\n}\n\n.wrdn-time-title-row{\n  align-self: start;\n  min-height: 20px;\n}\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n.wrdn-time-chart .wrdn-time-total{\n  width: 100%;\n  height: 27px;\n  margin: 0;\n  align-self: end;\n  border-radius: 5px;\n  background: var(--wrdn-soft-2);\n  color: #736b64;\n  font-size: 8.6px;\n  line-height: 27px;\n  text-align: center;\n}\n\n@container weread-dashboard (max-width: 420px) {\n  \n\n  \n\n  \n\n  \n\n  \n}\n\n\n/* MVP2.10：标题数据来源与周回顾字号口径。 */\n.wrdn-header-source{\n  gap: 7px;\n  color: var(--wrdn-muted);\n  font-size: 13px;\n  font-weight: 500;\n  letter-spacing: 0;\n}\n\n.wrdn-header-source .wrdn-icon{\n  width: 15px;\n  height: 15px;\n  color: var(--wrdn-text);\n}\n\n.wrdn-note-box-title{\n  margin: 0;\n  font-size: 10.5px !important;\n  font-weight: 680 !important;\n  line-height: 1.45 !important;\n}\n\n.wrdn-note-box-content,\n.wrdn-focus-list,\n.wrdn-inline-input-tall,\n.wrdn-inline-input-gain{\n  font-size: var(--wrdn-review-field-font) !important;\n  font-weight: 400 !important;\n  line-height: var(--wrdn-review-field-line) !important;\n  letter-spacing: 0 !important;\n}\n\n.wrdn-note-box-content{\n  display: block !important;\n  overflow: visible !important;\n  text-overflow: clip !important;\n  white-space: normal !important;\n  -webkit-box-orient: initial !important;\n  -webkit-line-clamp: unset !important;\n}\n\n.wrdn-footer{\n  justify-content: flex-start;\n}\n\n@container weread-dashboard (max-width: 620px) {\n  .wrdn-header-source{\n    max-width: 44%;\n    font-size: 8.5px;\n    line-height: 1.25;\n    white-space: normal;\n    text-align: right;\n  }\n}\n\n/* MVP2.11：用共享语义类锁定周回顾标题/正文尺寸，并收紧阅读时段卡片边界。 */\n.wrdn-dashboard{\n  --wrdn-review-title-font: 10.5px;\n  --wrdn-review-content-font: 10px;\n  --wrdn-review-content-line: 1.62;\n}\n\n.wrdn-review .wrdn-review-field-title,\n.wrdn-review .wrdn-review-subtitle.wrdn-review-field-title,\n.wrdn-review .wrdn-note-box-title.wrdn-review-field-title{\n  margin-top: 14px;\n  font-size: var(--wrdn-review-title-font) !important;\n  font-weight: 680 !important;\n  line-height: 1.45 !important;\n  letter-spacing: 0 !important;\n}\n\n.wrdn-review .wrdn-note-box-title.wrdn-review-field-title{\n  margin-top: 0;\n}\n\n.wrdn-review .wrdn-review-field-content,\n.wrdn-review .wrdn-review-field-content > li,\n.wrdn-review .wrdn-focus-list.wrdn-review-field-content,\n.wrdn-review .wrdn-note-box-content.wrdn-review-field-content,\n.wrdn-review textarea.wrdn-review-field-content{\n  font-family: inherit !important;\n  font-size: var(--wrdn-review-content-font) !important;\n  font-weight: 400 !important;\n  line-height: var(--wrdn-review-content-line) !important;\n  letter-spacing: 0 !important;\n}\n\n.wrdn-review .wrdn-note-box-content.wrdn-review-field-content{\n  display: block !important;\n  overflow: visible !important;\n  text-overflow: clip !important;\n  white-space: normal !important;\n  -webkit-box-orient: initial !important;\n  -webkit-line-clamp: unset !important;\n}\n\n.wrdn-chart-grid,\n.wrdn-chart.wrdn-time-chart,\n.wrdn-time-chart .wrdn-time-total{\n  min-width: 0 !important;\n  max-width: 100% !important;\n  box-sizing: border-box !important;\n}\n\n.wrdn-chart.wrdn-time-chart{\n  overflow: hidden !important;\n}\n\n\n\n.wrdn-time-chart .wrdn-time-total{\n  position: static !important;\n  display: block !important;\n  width: auto !important;\n  min-width: 0 !important;\n  max-width: 100% !important;\n  margin: 0 !important;\n  padding: 0 10px !important;\n  justify-self: stretch !important;\n  align-self: end !important;\n  overflow: hidden !important;\n  white-space: nowrap !important;\n  text-overflow: ellipsis !important;\n}\n\n/* MVP2.12：阅读时段卡片改为基于实际列宽自适应，避免固定 290px 内容被裁切。 */\n.wrdn-chart.wrdn-time-chart{\n  min-width: 0 !important;\n  overflow: hidden !important;\n}\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n.wrdn-time-chart .wrdn-time-total{\n  width: 100% !important;\n  max-width: 100% !important;\n  padding-inline: 8px !important;\n}\n\n@container weread-dashboard (max-width: 1040px) {\n  \n\n  \n\n  \n\n  \n}\n\n\n/* MVP2.13：阅读时段模块采用固定 viewBox 的 SVG，锁定冻结稿比例。 */\n.wrdn-chart.wrdn-time-chart{\n  display: grid !important;\n  min-width: 0 !important;\n  height: 229px !important;\n  min-height: 229px !important;\n  grid-template-rows: 20px minmax(0, 1fr) 27px !important;\n  padding: 14px 13px 10px !important;\n  overflow: hidden !important;\n}\n\n.wrdn-time-svg{\n  display: block;\n  width: 100%;\n  max-width: 306px;\n  height: auto;\n  max-height: 138px;\n  align-self: center;\n  justify-self: center;\n  overflow: visible;\n}\n\n.wrdn-time-svg text{\n  font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif;\n}\n\n.wrdn-time-center-label{\n  fill: #5f5953;\n  font-size: 13px;\n  font-weight: 400;\n}\n\n.wrdn-time-center-value{\n  fill: #211f1d;\n  font-size: 21px;\n  font-weight: 560;\n}\n\n.wrdn-time-legend-name{\n  fill: #3e3935;\n  font-size: 13px;\n  font-weight: 400;\n}\n\n.wrdn-time-legend-value{\n  fill: #3e3935;\n  font-size: 9.6px;\n  font-weight: 550;\n}\n\n.wrdn-time-chart .wrdn-time-total{\n  position: static !important;\n  box-sizing: border-box !important;\n  display: block !important;\n  width: 100% !important;\n  min-width: 0 !important;\n  max-width: 100% !important;\n  height: 27px !important;\n  margin: 0 !important;\n  padding: 0 10px !important;\n  align-self: end !important;\n  justify-self: stretch !important;\n  overflow: hidden !important;\n  border-radius: 5px !important;\n  background: var(--wrdn-soft-2) !important;\n  color: #736b64 !important;\n  font-size: 8.6px !important;\n  line-height: 27px !important;\n  text-align: center !important;\n  text-overflow: ellipsis !important;\n  white-space: nowrap !important;\n}\n\n/* 旧版圆环/图例 DOM 已不再生成，明确隐藏以避免缓存残留。 */\n\n\n\n/* MVP2.14：严格校准阅读节奏内部比例、底部横条，并启用顶部刷新和月份选择。 */\n.wrdn-refresh-button{\n  display: inline-flex !important;\n  width: 28px;\n  height: 28px;\n  flex: 0 0 auto;\n  align-items: center;\n  justify-content: center;\n  padding: 0 !important;\n  border: 0 !important;\n  border-radius: 6px !important;\n  background: transparent !important;\n  color: var(--wrdn-text) !important;\n  cursor: pointer;\n}\n\n.wrdn-refresh-button:hover{\n  background: var(--wrdn-soft-2) !important;\n}\n\n.wrdn-refresh-button.is-refreshing .wrdn-icon{\n  animation: wrdn-refresh-spin .8s linear infinite;\n}\n\n@keyframes wrdn-refresh-spin {\n  to { transform: rotate(360deg); }\n}\n\n\n\n\n\n.wrdn-chart.wrdn-trend,\n.wrdn-chart.wrdn-time-chart{\n  display: grid !important;\n  grid-template-rows: 20px minmax(0, 1fr) 27px !important;\n  padding: 14px 13px 10px !important;\n}\n\n.wrdn-chart.wrdn-trend .wrdn-trend-svg{\n  width: 100% !important;\n  height: auto !important;\n  max-height: 148px !important;\n  margin: 0 !important;\n  align-self: center !important;\n}\n\n.wrdn-chart.wrdn-trend .wrdn-trend-note,\n.wrdn-chart.wrdn-time-chart .wrdn-time-total{\n  width: 100% !important;\n  height: 27px !important;\n  margin: 0 !important;\n  align-self: end !important;\n  line-height: 27px !important;\n}\n\n.wrdn-time-svg{\n  width: 100% !important;\n  max-width: 306px !important;\n  height: auto !important;\n  max-height: 138px !important;\n  align-self: center !important;\n  justify-self: center !important;\n}\n\n.wrdn-time-legend-name{\n  font-size: 9.5px !important;\n}\n\n.wrdn-time-legend-value{\n  font-size: 9px !important;\n}\n\n\n/* MVP2.14.1：按冻结截图 240×144 的内部坐标锁定阅读时段图。 */\n.wrdn-time-svg{\n  width: 100% !important;\n  max-width: 240px !important;\n  max-height: 144px !important;\n}\n.wrdn-time-center-label{ font-size: 9px !important; }\n.wrdn-time-center-value{ font-size: 20px !important; }\n.wrdn-time-legend-name{ font-size: 8.5px !important; }\n.wrdn-time-legend-value{ font-size: 8px !important; }\n\n\n/* MVP2.16：本月概览固定为当前月，不再显示月份选择控件。 */\n\n.wrdn-source-status{\n  white-space: nowrap !important;\n}\n\n.wrdn-refresh-button:disabled{\n  cursor: wait !important;\n  opacity: .72 !important;\n}\n\n.wrdn-chart.wrdn-trend,\n.wrdn-chart.wrdn-time-chart{\n  box-sizing: border-box !important;\n  display: grid !important;\n  height: 229px !important;\n  min-height: 229px !important;\n  grid-template-rows: 20px 144px 27px !important;\n  row-gap: 6px !important;\n  padding: 14px 13px 10px !important;\n  overflow: hidden !important;\n}\n\n.wrdn-chart.wrdn-trend > .wrdn-chart-title,\n.wrdn-chart.wrdn-time-chart > .wrdn-time-title-row{\n  height: 20px !important;\n  min-height: 20px !important;\n  align-self: center !important;\n}\n\n.wrdn-chart.wrdn-trend .wrdn-trend-svg,\n.wrdn-chart.wrdn-time-chart .wrdn-time-svg{\n  width: 100% !important;\n  height: 144px !important;\n  min-height: 144px !important;\n  max-height: 144px !important;\n  margin: 0 auto !important;\n  align-self: center !important;\n  justify-self: center !important;\n}\n\n.wrdn-chart.wrdn-trend .wrdn-trend-svg{\n  max-width: 100% !important;\n}\n\n.wrdn-chart.wrdn-time-chart .wrdn-time-svg{\n  width: 240px !important;\n  max-width: min(100%, 240px) !important;\n  overflow: visible !important;\n}\n\n.wrdn-chart.wrdn-trend .wrdn-trend-note,\n.wrdn-chart.wrdn-time-chart .wrdn-time-total{\n  box-sizing: border-box !important;\n  width: 100% !important;\n  height: 27px !important;\n  min-height: 27px !important;\n  max-height: 27px !important;\n  margin: 0 !important;\n  padding: 0 10px !important;\n  align-self: stretch !important;\n  justify-self: stretch !important;\n  border-radius: 5px !important;\n  line-height: 27px !important;\n}\n\n.wrdn-time-center-label{\n  font-size: 9px !important;\n}\n\n.wrdn-time-center-value{\n  font-size: 20px !important;\n}\n\n.wrdn-time-legend-name{\n  font-size: 8.5px !important;\n  font-weight: 400 !important;\n}\n\n.wrdn-time-legend-value{\n  font-size: 8px !important;\n  font-weight: 550 !important;\n}\n\n/* MVP2.17：回顾观点改为不限条数的单一编辑框，并移除无效跳转入口。 */\n\n\n\n\n\n\n/* MVP3.10.10：新增“查看洞察”按钮，并让阅读重点勾选框可直接切换状态。 */\n.wrdn-review-subtitle-row{\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n  margin-top: 14px;\n}\n\n.wrdn-review-subtitle-row .wrdn-review-subtitle.wrdn-review-field-title{\n  margin-top: 0 !important;\n}\n\n\n\n\n\n\n\n\n\n/* MVP3.10.9：周回顾收获前置、下周阅读重点改为勾选形式，删除知识与洞察底部入口。 */\n.wrdn-review-gain-box{\n  margin-top: 14px;\n}\n\n.wrdn-focus-checklist{\n  list-style: none;\n  padding-left: 0;\n}\n\n.wrdn-focus-check-item{\n  display: flex;\n  align-items: flex-start;\n  gap: 8px;\n  margin: 0 0 6px;\n}\n\n.wrdn-focus-check-item.is-checked .wrdn-focus-checktext{\n  color: var(--wrdn-muted);\n  text-decoration: line-through;\n  text-decoration-thickness: 1px;\n}\n\n.wrdn-focus-check-toggle{\n  display: inline-flex;\n  width: 16px;\n  height: 16px;\n  flex: 0 0 16px;\n  align-items: center;\n  justify-content: center;\n  margin-top: 1px;\n  padding: 0 !important;\n  border: 1px solid rgba(123, 79, 41, .32) !important;\n  border-radius: 4px !important;\n  background: rgba(123, 79, 41, .06) !important;\n  color: var(--wrdn-accent) !important;\n  font-size: 10px !important;\n  font-weight: 700 !important;\n  line-height: 1 !important;\n  cursor: pointer;\n}\n\n.wrdn-focus-check-toggle:hover,\n.wrdn-focus-check-toggle:focus-visible{\n  background: rgba(123, 79, 41, .12) !important;\n  border-color: rgba(123, 79, 41, .48) !important;\n}\n\n.wrdn-focus-check-toggle:disabled{\n  opacity: .65;\n  cursor: wait;\n}\n\n.wrdn-focus-checktext{\n  flex: 1 1 auto;\n  cursor: pointer;\n}\n\n.wrdn-focus-checklist > .wrdn-empty-value{\n  list-style: none;\n  margin-left: 0;\n}\n\n\n\n/* 放大环形图，同时扩大中间留白，防止“总计 / 18.6h”被圆环遮挡。 */\n.wrdn-chart.wrdn-time-chart .wrdn-time-svg{\n  flex-basis: 148px !important;\n  width: 252px !important;\n  max-width: min(100%, 252px) !important;\n  height: 148px !important;\n  min-height: 148px !important;\n  max-height: 148px !important;\n}\n\n.wrdn-time-center-label{\n  font-size: 8.5px !important;\n}\n\n.wrdn-time-center-value{\n  font-size: 18px !important;\n}\n\n\n/* MVP3.9：右上角“本月概览”替换为随机划线与想法的“灵感回顾”。 */\n.wrdn-inspiration{\n  box-sizing: border-box;\n  display: flex;\n  min-height: 357px;\n  flex-direction: column;\n  padding: 17px 16px 18px;\n}\n\n.wrdn-inspiration-header{\n  flex: 0 0 auto;\n}\n\n.wrdn-inspiration-shuffle{\n  appearance: none !important;\n  -webkit-appearance: none !important;\n  border: 0 !important;\n  background: transparent !important;\n  box-shadow: none !important;\n  color: var(--wrdn-accent) !important;\n  cursor: pointer;\n  font-family: inherit !important;\n}\n\n.wrdn-inspiration-shuffle{\n  display: inline-flex;\n  min-height: 24px;\n  align-items: center;\n  gap: 5px;\n  padding: 0 !important;\n  font-size: 11px !important;\n  font-weight: 650 !important;\n  white-space: nowrap;\n}\n\n.wrdn-inspiration-shuffle .wrdn-icon{\n  width: 14px;\n  height: 14px;\n}\n\n.wrdn-inspiration-shuffle:hover{\n  color: var(--wrdn-accent-strong) !important;\n}\n\n.wrdn-inspiration-shuffle:disabled{\n  cursor: default;\n  opacity: .45;\n}\n\n.wrdn-inspiration-card{\n  position: relative;\n  box-sizing: border-box;\n  display: flex;\n  min-height: 285px;\n  flex: 1 1 auto;\n  flex-direction: column;\n  margin-top: 15px;\n  padding: 43px 27px 20px;\n  overflow: hidden;\n  border: 1px solid var(--wrdn-border);\n  border-radius: 9px;\n  background: #fffdfa;\n}\n\n.wrdn-inspiration-mark{\n  position: absolute;\n  top: 18px;\n  left: 20px;\n  width: 19px;\n  height: 19px;\n  color: #d8c8b8;\n}\n\n.wrdn-inspiration-text{\n  display: -webkit-box;\n  margin: 0;\n  overflow: hidden;\n  color: var(--wrdn-text);\n  font-size: 17px;\n  font-style: normal;\n  font-weight: 500;\n  line-height: 1.85;\n  text-align: center;\n  -webkit-box-orient: vertical;\n  -webkit-line-clamp: 5;\n}\n\n.wrdn-inspiration-meta{\n  margin-top: auto;\n  padding-top: 18px;\n  color: var(--wrdn-muted);\n  font-size: 12px;\n  line-height: 1.75;\n}\n\n.wrdn-inspiration-book{\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n\n\n.wrdn-inspiration-empty{\n  margin: auto 0;\n  color: var(--wrdn-muted);\n  font-size: 12px;\n  line-height: 1.8;\n  text-align: center;\n}\n\n@container weread-dashboard (max-width: 860px) {\n  .wrdn-inspiration{\n    min-height: auto;\n  }\n\n  .wrdn-inspiration-card{\n    min-height: 250px;\n  }\n}\n\n\n/* MVP3.10.8：不改动左侧，只微调右侧圆环区域与目标编辑交互。 */\n.wrdn-goal{\n  align-self: stretch;\n  min-height: 223px;\n  padding-top: 0;\n  padding-bottom: 0;\n}\n\n.wrdn-reading-time{\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: flex-start;\n  min-height: 223px;\n  padding-top: 2px;\n  padding-bottom: 0;\n  gap: 10px;\n}\n\n.wrdn-reading-time-ring{\n  position: relative;\n  width: 144px;\n  height: 144px;\n  flex: 0 0 144px;\n}\n\n.wrdn-reading-time-svg{\n  display: block;\n  width: 100%;\n  height: 100%;\n  overflow: visible;\n  transform: rotate(-90deg);\n}\n\n.wrdn-reading-time-track,\n.wrdn-reading-time-progress{\n  fill: none;\n  stroke-width: 9;\n}\n\n.wrdn-reading-time-track{\n  stroke: #efe6db;\n}\n\n.wrdn-reading-time-progress{\n  stroke: var(--wrdn-accent);\n  stroke-linecap: round;\n  transition: stroke-dasharray .35s ease, stroke .25s ease;\n}\n\n.wrdn-reading-time-ring.is-complete .wrdn-reading-time-progress{\n  stroke: var(--wrdn-accent-strong);\n}\n\n.wrdn-reading-time-value{\n  position: absolute;\n  inset: 0;\n  z-index: 1;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  flex-direction: column;\n  pointer-events: none;\n  text-align: center;\n}\n\n.wrdn-reading-duration-parts{\n  display: inline-flex;\n  max-width: 108px;\n  align-items: baseline;\n  justify-content: center;\n  gap: 3px;\n  white-space: nowrap;\n}\n\n.wrdn-reading-duration-part{\n  display: inline-flex;\n  align-items: baseline;\n  gap: 1px;\n}\n\n.wrdn-reading-duration-part strong{\n  color: var(--wrdn-text);\n  font-size: 24px;\n  font-weight: 700;\n  line-height: .96;\n  letter-spacing: -.035em;\n  font-variant-numeric: tabular-nums;\n}\n\n.wrdn-reading-duration-part small{\n  color: var(--wrdn-text);\n  font-size: 11px;\n  font-weight: 620;\n  line-height: 1;\n}\n\n.wrdn-reading-duration-caption{\n  margin-top: 8px;\n  color: var(--wrdn-muted);\n  font-size: 11px;\n  font-weight: 560;\n  letter-spacing: .04em;\n  line-height: 1;\n}\n\n.wrdn-reading-time-value.is-empty strong{\n  max-width: 108px;\n  color: var(--wrdn-text);\n  font-size: 14px;\n  font-weight: 650;\n  line-height: 1.35;\n  letter-spacing: 0;\n  white-space: normal;\n}\n\n.wrdn-reading-time-value.is-empty span{\n  margin-top: 4px;\n  color: var(--wrdn-muted);\n  font-size: 11px;\n  font-weight: 520;\n}\n\n.wrdn-reading-goal-control{\n  display: flex;\n  width: 100%;\n  min-height: 30px;\n  align-items: center;\n  justify-content: center;\n  margin-top: 2px;\n}\n\n.wrdn-reading-goal-trigger{\n  display: inline-flex;\n  min-height: 30px;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  padding: 0 8px !important;\n  border: 0 !important;\n  border-radius: 7px !important;\n  outline: none;\n  background: transparent !important;\n  color: var(--wrdn-muted) !important;\n  cursor: pointer;\n  transition: background .18s ease, color .18s ease;\n}\n\n.wrdn-reading-goal-trigger:hover,\n.wrdn-reading-goal-trigger:focus-visible{\n  background: var(--wrdn-accent-soft) !important;\n  color: var(--wrdn-accent) !important;\n}\n\n.wrdn-reading-goal-trigger .wrdn-icon{\n  width: 14px;\n  height: 14px;\n  color: currentColor;\n}\n\n.wrdn-reading-goal-trigger span{\n  font-size: 11px;\n  font-weight: 590;\n  white-space: nowrap;\n}\n\n.wrdn-reading-goal-trigger .wrdn-reading-goal-edit{\n  width: 12px;\n  height: 12px;\n  opacity: .62;\n}\n\n.wrdn-reading-time.is-editing-goal > .wrdn-reading-time-ring,\n.wrdn-reading-time.is-editing-goal > .wrdn-reading-goal-control,\n.wrdn-reading-time.is-editing-goal > .wrdn-primary{\n  visibility: hidden;\n  pointer-events: none;\n}\n\n.wrdn-reading-goal-editor{\n  position: absolute;\n  inset: 0;\n  z-index: 5;\n  display: flex;\n  min-height: 223px;\n  align-items: center;\n  justify-content: center;\n  flex-direction: column;\n  gap: 9px;\n  padding: 12px 10px;\n  border: 1px solid var(--wrdn-border);\n  border-radius: 11px;\n  background: #fffdfa;\n  box-shadow: 0 10px 28px rgba(44, 31, 20, .10);\n}\n\n.wrdn-reading-goal-editor-head{\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  color: var(--wrdn-text);\n}\n\n.wrdn-reading-goal-editor-head .wrdn-icon{\n  width: 15px;\n  height: 15px;\n  color: var(--wrdn-accent);\n}\n\n.wrdn-reading-goal-editor-head strong{\n  font-size: 11.5px;\n  font-weight: 650;\n}\n\n.wrdn-reading-goal-presets{\n  display: grid;\n  width: 100%;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 6px;\n}\n\n.wrdn-reading-goal-chip{\n  min-width: 0;\n  min-height: 32px;\n  padding: 0 7px !important;\n  border: 1px solid var(--wrdn-border) !important;\n  border-radius: 7px !important;\n  background: #fff !important;\n  color: var(--wrdn-text) !important;\n  font-size: 10.5px !important;\n  font-weight: 560 !important;\n  cursor: pointer;\n}\n\n.wrdn-reading-goal-chip:hover,\n.wrdn-reading-goal-chip.is-active{\n  border-color: rgba(123, 79, 41, .24) !important;\n  background: var(--wrdn-accent-soft) !important;\n  color: var(--wrdn-accent) !important;\n}\n\n.wrdn-reading-goal-chip.is-active{\n  font-weight: 650 !important;\n}\n\n.wrdn-reading-goal-input-row{\n  display: grid;\n  width: 100%;\n  grid-template-columns: 28px minmax(0, 1fr) auto 28px;\n  align-items: center;\n  gap: 6px;\n}\n\n.wrdn-reading-goal-step{\n  width: 28px;\n  height: 28px;\n  padding: 0 !important;\n  border: 1px solid var(--wrdn-border) !important;\n  border-radius: 50% !important;\n  background: #fff !important;\n  color: var(--wrdn-text) !important;\n  font-size: 17px !important;\n  line-height: 1 !important;\n  cursor: pointer;\n}\n\n.wrdn-reading-goal-step:hover{\n  border-color: var(--wrdn-border-strong) !important;\n  background: var(--wrdn-accent-soft) !important;\n}\n\n.wrdn-reading-goal-input{\n  width: 100%;\n  min-width: 0;\n  height: 30px;\n  padding: 0 5px;\n  border: 1px solid var(--wrdn-border-strong);\n  border-radius: 7px;\n  outline: none;\n  background: #fff;\n  color: var(--wrdn-text);\n  text-align: center;\n  font-family: inherit;\n  font-size: 15px;\n  font-weight: 650;\n  font-variant-numeric: tabular-nums;\n}\n\n.wrdn-reading-goal-input:focus{\n  border-color: #c8aa8b;\n  box-shadow: 0 0 0 2px rgba(123, 79, 41, .08);\n}\n\n.wrdn-reading-goal-unit{\n  color: var(--wrdn-muted);\n  font-size: 13px;\n  white-space: nowrap;\n}\n\n.wrdn-reading-goal-actions{\n  display: grid;\n  width: 100%;\n  grid-template-columns: 1fr 1fr;\n  gap: 6px;\n}\n\n.wrdn-reading-goal-action{\n  min-height: 29px;\n  padding: 0 10px !important;\n  border-radius: 7px !important;\n  cursor: pointer;\n  font-size: 10.5px !important;\n  font-weight: 620 !important;\n}\n\n.wrdn-reading-goal-action.secondary{\n  border: 1px solid var(--wrdn-border) !important;\n  background: #fff !important;\n  color: var(--wrdn-text) !important;\n}\n\n.wrdn-reading-goal-action.primary{\n  border: 1px solid var(--wrdn-accent) !important;\n  background: var(--wrdn-accent) !important;\n  color: #fff !important;\n}\n\n.wrdn-reading-goal-action.primary:disabled{\n  opacity: .65;\n  cursor: wait;\n}\n\n.wrdn-reading-time .wrdn-primary{\n  width: 100%;\n  margin-top: auto !important;\n}\n\n@container weread-dashboard (max-width: 860px) {\n  .wrdn-reading-time{\n    min-height: auto;\n    gap: 10px;\n  }\n\n  .wrdn-reading-time-ring{\n    width: 132px;\n    height: 132px;\n    flex-basis: 132px;\n  }\n\n  .wrdn-reading-duration-part strong{\n    font-size: 24px;\n  }\n}\n\n.wrdn-inspiration-card.is-thought .wrdn-inspiration-mark{\n  color: var(--wrdn-accent);\n}\n\n.wrdn-inspiration-card.is-highlight .wrdn-inspiration-mark{\n  color: #d8c8b8;\n}\n\n.wrdn-inspiration-meta{\n  align-self: flex-end;\n  width: min(100%, 180px);\n  margin-top: auto;\n  padding-top: 20px;\n  color: var(--wrdn-muted);\n  font-size: 12px;\n  line-height: 1.75;\n  text-align: right;\n}\n\n\n\n\n\n\n\n/* MVP3.10.23：统一首页右上角入口样式。 */\n.wrdn-all-books.wrdn-section-link{\n  appearance: none !important;\n  -webkit-appearance: none !important;\n  display: inline-flex;\n  min-height: 24px;\n  align-items: center;\n  justify-content: center;\n  gap: 5px;\n  padding: 0 !important;\n  border: 0 !important;\n  border-radius: 0 !important;\n  background: transparent !important;\n  color: var(--wrdn-accent) !important;\n  font-family: inherit !important;\n  font-size: 11px !important;\n  font-weight: 650 !important;\n  line-height: 1.2 !important;\n  letter-spacing: 0 !important;\n  white-space: nowrap;\n}\n.wrdn-all-books.wrdn-section-link:hover,\n.wrdn-all-books.wrdn-section-link:focus-visible{\n  background: transparent !important;\n  color: var(--wrdn-accent-strong) !important;\n}\n.wrdn-section-link-label,\n.wrdn-section-link-arrow{\n  display: inline-block;\n  font: inherit;\n  line-height: inherit;\n}\n.wrdn-section-link-arrow{\n  transform: translateY(-.02em);\n}\n\n/* 阅读重点仅点击列表空白区域进入编辑；标题与书名保持普通展示。 */\n.wrdn-focus-checklist.wrdn-focus-edit-surface{\n  min-height: 48px;\n  cursor: text;\n}\n.wrdn-focus-checklist.wrdn-focus-edit-surface:hover{\n  background: rgba(123, 79, 41, 0.035);\n}\n.wrdn-focus-checktext{\n  cursor: default;\n}\n.wrdn-focus-check-toggle{\n  cursor: pointer;\n}\n\n"},"_系统/功能页面.css":{"mode":"managed","content":":host{\n  display: block;\n  color: #28231f;\n  font-family: var(--font-interface, system-ui, -apple-system, \"PingFang SC\", \"Microsoft YaHei\", sans-serif);\n  --brown: #875728;\n  --brown-dark: #6f441d;\n  --bg: #f8f5f0;\n  --panel: #fffdfa;\n  --line: #eadfd3;\n  --muted: #81786f;\n  --soft: #f5ecdf;\n  --green: #429f68;\n  --wrdn-page-max-width: 1024px;\n  --wrdn-page-gutter: 18px;\n}\n*{ box-sizing: border-box; }\nbutton,\ninput,\ntextarea,\nselect{ font: inherit; }\n.wrdn-page{\n  width: min(100%, var(--wrdn-page-max-width));\n  max-width: var(--wrdn-page-max-width);\n  margin: 0 auto;\n  padding: 12px var(--wrdn-page-gutter) 48px;\n  display: grid;\n  gap: 20px;\n}\n\n.wrdn-p-icon{ display: inline-flex; width: 20px; height: 20px; flex: 0 0 auto; }\n.wrdn-p-icon svg{ width: 100%; height: 100%; }\n.wrdn-p-header{\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 18px;\n  padding: 12px 0 18px;\n  border-bottom: 1px solid var(--line);\n  background: transparent;\n}\n.wrdn-p-header-left{ display: flex; align-items: center; gap: 18px; min-width: 0; }\n\n.wrdn-p-back{\n  appearance: none;\n  border: 0;\n  background: transparent;\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  color: var(--brown);\n  padding: 8px 0;\n  cursor: pointer;\n  white-space: nowrap;\n}\n\n\n\n.wrdn-p-btn{\n  appearance: none;\n  border: 1px solid #decfbe;\n  background: #fff;\n  border-radius: 10px;\n  padding: 9px 13px;\n  color: #49372a;\n  font-size: 14px;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 7px;\n  cursor: pointer;\n  text-decoration: none;\n}\n.wrdn-p-btn:hover{ border-color: #b98c60; background: #fffaf4; }\n.wrdn-p-btn.primary{ background: var(--brown); border-color: var(--brown); color: #fff; }\n\n.wrdn-p-controls{ display: grid; grid-template-columns: minmax(220px, 1fr) auto auto; gap: 12px; align-items: center; }\n.wrdn-p-search{ display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); background: #fff; border-radius: 12px; padding: 0 12px; height: 44px; }\n\n.wrdn-p-input{ width: 100%; border: 0; background: transparent; color: inherit; outline: none; }\n\n.wrdn-p-segmented{ display: flex; gap: 8px; flex-wrap: wrap; }\n.wrdn-p-chip{\n  appearance: none;\n  border: 0;\n  background: #f2ede8;\n  color: #756d65;\n  border-radius: 999px;\n  padding: 9px 16px;\n  cursor: pointer;\n}\n.wrdn-p-chip.is-active{ background: var(--brown); color: #fff; }\n\n\n.wrdn-p-book-grid{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }\n.wrdn-p-book-grid-empty{ grid-column: 1 / -1; }\n.wrdn-p-book-card{ border: 1px solid var(--line); border-radius: 14px; background: var(--panel); padding: 14px; transition: .16s ease; }\n.is-clickable{ cursor: pointer; }\n.is-clickable:hover{ transform: translateY(-1px); border-color: #ceb292; box-shadow: 0 8px 20px rgba(93, 62, 32, .08); }\n.wrdn-p-cover{ height: 190px; border-radius: 8px; background-position: center; background-size: cover; background-color: var(--panel, #fffdfa); display: flex; align-items: center; justify-content: center; text-align: center; padding: 12px; }\n.wrdn-page .has-cover-image{ padding: 0; overflow: hidden; background-image: none; }\n.wrdn-page .wrdn-cover-image{ display: block; width: 100%; height: 100%; object-fit: contain; object-position: center; }\n.wrdn-p-book-card-info{ display: grid; gap: 5px; margin-top: 12px; }\n.wrdn-p-book-card h3{ margin: 0; }\n.wrdn-p-book-card-info p{ margin: 0; color: var(--muted); font-size: 13px; }\n.wrdn-p-book-card-progress{ display: flex; align-items: center; gap: 10px; margin-top: 12px; }\n.wrdn-p-progress{ height: 8px; background: #eee5da; border-radius: 999px; overflow: hidden; flex: 1; }\n.wrdn-p-progress i{ display: block; height: 100%; background: var(--brown); border-radius: inherit; }\n.wrdn-p-book-meta{ margin-top: 11px; color: var(--muted); font-size: 12px; }\n.wrdn-p-badge{ display: inline-flex; width: max-content; background: #f6ead8; color: #865727; border-radius: 999px; padding: 4px 9px; font-size: 12px; }\n.wrdn-p-badge.done{ background: #eeeef4; color: #6e687d; }\n.wrdn-p-badge.neutral{ background: #f1eeea; color: #706860; }\n\n\n\n\n\n.wrdn-p-card{ border: 1px solid var(--line); border-radius: 16px; background: var(--panel); padding: 18px; }\n.wrdn-p-section-title{ font-size: 18px; margin: 0 0 14px; }\n.wrdn-p-muted{ color: var(--muted); }\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n.wrdn-p-empty{ grid-column: 1/-1; border: 1px dashed #d9c7b4; border-radius: 14px; padding: 24px; text-align: center; color: var(--muted); }\n.wrdn-p-empty .wrdn-p-icon{ width: 28px; height: 28px; color: #b28659; }\n\n.wrdn-p-tab-content{ display: grid; gap: 18px; }\n\n/* 书籍详情页 */\n\n\n\n.wrdn-book-cover{ min-height: 250px; border-radius: 10px; background-position: center; background-size: cover; background-color: #eee; box-shadow: 0 12px 28px rgba(50, 37, 25, .13); }\n\n\n.wrdn-book-title{ margin: 15px 0 5px; font-size: 34px; line-height: 1.18; letter-spacing: -.02em; }\n\n.wrdn-book-author{ margin: 0; color: var(--muted); font-size: 15px; }\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n.wrdn-form-actions{ display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }\n\n\n\n\n\n\n/* MVP3.5 知识中心 */\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n.wrdn-k-fields-layout{ display: grid; grid-template-columns: minmax(320px, .75fr) minmax(0, 1.25fr); gap: 16px; align-items: start; }\n.wrdn-k-field-grid{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }\n.wrdn-k-field-card{ display: grid; gap: 8px; min-height: 132px; padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); }\n.wrdn-k-field-card.is-selected{ border-color: #b98c60; box-shadow: 0 0 0 3px rgba(185, 140, 96, .1); }\n.wrdn-k-field-card h3{ margin: 0; font-size: 16px; }\n.wrdn-k-field-card strong{ font-size: 26px; }\n.wrdn-k-field-card p{ margin: 0; color: var(--muted); font-size: 12px; }\n.wrdn-k-field-detail{ min-height: 300px; }\n.wrdn-k-field-books{ display: grid; gap: 9px; margin-top: 16px; }\n\n@media (max-width: 960px) {\n  .wrdn-p-book-grid{ grid-template-columns: repeat(3, minmax(0, 1fr)); }\n  \n  .wrdn-p-controls{ grid-template-columns: 1fr; }\n  \n  \n  .wrdn-k-fields-layout{ grid-template-columns: 1fr; }\n  \n  \n  \n  \n  \n  \n}\n@media (max-width: 680px) {\n  .wrdn-page{ padding: 8px 14px 36px; }\n  .wrdn-p-header{ display: grid; }\n  \n  .wrdn-p-book-grid{ grid-template-columns: repeat(2, minmax(0, 1fr)); }\n  \n  \n  \n  \n  .wrdn-k-field-grid{ grid-template-columns: 1fr; }\n  \n  \n  \n  \n  .wrdn-book-cover{ min-height: 170px; }\n  .wrdn-book-title{ font-size: 25px; margin-top: 11px; }\n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n}\n\n/* MVP3.6 知识中心：详情页不重复首页摘要，只浏览具体内容 */\n.wrdn-k-browser-body{ min-width: 0; }\n.wrdn-k-browser{\n  display: grid;\n  gap: 16px;\n  min-width: 0;\n}\n.wrdn-k-browser-toolbar{\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 14px;\n}\n.wrdn-k-search{\n  display: block;\n  width: min(460px, 100%);\n  min-width: 0;\n  height: 42px;\n  padding: 0 14px;\n  border: 1px solid var(--line);\n  border-radius: 12px;\n  outline: none;\n  background: #fff;\n  color: #28231f;\n}\n.wrdn-k-search:focus{\n  border-color: #b98c60;\n  box-shadow: 0 0 0 3px rgba(185, 140, 96, .12);\n}\n.wrdn-k-filter-row{\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  flex: 0 0 auto;\n}\n.wrdn-k-filter-chip,\n.wrdn-k-more{\n  appearance: none;\n  border: 0;\n  cursor: pointer;\n  font: inherit;\n}\n.wrdn-k-filter-chip{\n  padding: 8px 14px;\n  border-radius: 999px;\n  background: #f2ede8;\n  color: #756d65;\n}\n.wrdn-k-filter-chip.is-active{\n  background: var(--brown);\n  color: #fff;\n}\n.wrdn-k-content-list{\n  display: grid;\n  gap: 10px;\n}\n.wrdn-k-content-item{\n  display: grid;\n  gap: 9px;\n  padding: 15px 17px;\n  border: 1px solid var(--line);\n  border-radius: 14px;\n  background: var(--panel);\n}\n.wrdn-k-content-item:hover{\n  transform: none;\n  box-shadow: none;\n  background: #fffaf4;\n}\n\n\n\n\n\n\n\n.wrdn-k-content-text{\n  margin: 0;\n  line-height: 1.75;\n  color: #332e29;\n}\n.wrdn-k-content-source{\n  margin: 0;\n  padding: 9px 12px;\n  border-left: 3px solid #d8b58c;\n  border-radius: 0 9px 9px 0;\n  background: #faf4eb;\n  color: #71685f;\n  font-size: 13px;\n  line-height: 1.65;\n}\n\n.wrdn-k-content-footer{\n  display: flex;\n  justify-content: center;\n  min-height: 24px;\n}\n.wrdn-k-more{\n  padding: 9px 16px;\n  border-radius: 999px;\n  background: #f2ede8;\n  color: var(--brown-dark);\n}\n.wrdn-k-result-note{\n  color: var(--muted);\n  font-size: 12px;\n}\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n@media (max-width: 680px) {\n  .wrdn-k-browser-toolbar{\n    align-items: stretch;\n    flex-direction: column;\n  }\n  .wrdn-k-search{\n    width: 100%;\n  }\n  .wrdn-k-filter-row{\n    justify-content: flex-start;\n  }\n  \n  \n  \n}\n\n/* MVP3.7 知识中心布局重构 */\n.wrdn-k-topbar{\n  display: flex;\n  align-items: center;\n  min-height: 42px;\n  padding-bottom: 10px;\n  border-bottom: 1px solid var(--line);\n}\n.wrdn-k-topbar .wrdn-p-back{ padding-block: 6px; }\n\n/* 全部内容：正文优先，类型仅用边框和底部元信息区分 */\n.wrdn-k-content-list{ gap: 11px; }\n.wrdn-k-content-item{\n  gap: 11px;\n  padding: 17px 18px 14px;\n  border: 1px solid var(--line);\n  border-left-width: 4px;\n  border-radius: 13px;\n  background: #fffdfa;\n}\n.wrdn-k-content-item.is-highlight{\n  border-left-color: #b9824d;\n  background: linear-gradient(90deg, rgba(185,130,77,.055), transparent 34%);\n}\n.wrdn-k-content-item.is-thought{\n  border-left-color: #5f9c78;\n  background: linear-gradient(90deg, rgba(95,156,120,.06), transparent 34%);\n}\n.wrdn-k-content-item:hover{\n  border-color: var(--line);\n  background-color: #fffaf4;\n}\n.wrdn-k-content-item.is-highlight:hover{ border-left-color: #b9824d; }\n.wrdn-k-content-item.is-thought:hover{ border-left-color: #5f9c78; }\n.wrdn-k-content-text{\n  margin: 0;\n  color: #2e2925;\n  font-size: 16px;\n  line-height: 1.75;\n}\n.wrdn-k-content-source{\n  margin: -1px 0 0;\n  padding: 8px 11px;\n  border-left: 0;\n  border-radius: 8px;\n  background: #f7f1e9;\n  color: #756c63;\n  font-size: 13px;\n  line-height: 1.65;\n}\n.wrdn-k-record-meta{\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 0;\n  color: var(--muted);\n  font-size: 12px;\n}\n.wrdn-k-record-meta > span + span::before{\n  content: \"·\";\n  margin: 0 8px;\n  color: #b7ada3;\n}\n.wrdn-k-record-type{ font-weight: 700; }\n.wrdn-k-record-type.is-highlight{ color: #9a642f; }\n.wrdn-k-record-type.is-thought{ color: #4f8665; }\n.wrdn-k-record-book{\n  max-width: 48%;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n/* 来源书籍：双列贡献卡片，封面、构成与总量同屏 */\n.wrdn-k-source-card-grid{\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 12px;\n}\n.wrdn-k-source-card{\n  display: grid;\n  grid-template-columns: 58px minmax(0, 1fr);\n  gap: 14px;\n  align-items: center;\n  min-height: 108px;\n  padding: 14px;\n  border: 1px solid var(--line);\n  border-radius: 14px;\n  background: var(--panel);\n}\n.wrdn-k-source-card:hover{ background: #fffaf4; }\n.wrdn-k-source-card.is-selected{\n  border-color: #b98c60;\n  box-shadow: 0 0 0 3px rgba(185,140,96,.1);\n}\n.wrdn-k-source-card-cover{\n  width: 58px;\n  height: 82px;\n  border-radius: 7px;\n  background-position: center;\n  background-size: cover;\n  background-color: #eee;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 6px;\n  text-align: center;\n  font-size: 9px;\n}\n.wrdn-k-source-card-copy{ display: grid; gap: 7px; min-width: 0; }\n.wrdn-k-source-card-title{\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 12px;\n  min-width: 0;\n}\n.wrdn-k-source-card-title strong{\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.wrdn-k-source-card-title b{ flex: 0 0 auto; font-size: 16px; }\n.wrdn-k-source-card-copy > small{\n  overflow: hidden;\n  color: var(--muted);\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.wrdn-k-source-card-stats{\n  display: flex;\n  gap: 12px;\n  color: var(--muted);\n  font-size: 12px;\n}\n.wrdn-k-source-card-track{\n  height: 6px;\n  overflow: hidden;\n  border-radius: 999px;\n  background: #eee5da;\n}\n.wrdn-k-source-card-track i{\n  display: block;\n  height: 100%;\n  border-radius: inherit;\n  background: var(--brown);\n}\n\n/* 阅读主题：恢复“主题卡片 + 当前主题详情”双栏结构 */\n.wrdn-k-fields-layout{\n  display: grid;\n  grid-template-columns: minmax(300px, .72fr) minmax(0, 1.28fr);\n  gap: 16px;\n  align-items: start;\n}\n.wrdn-k-field-grid{\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 12px;\n}\n.wrdn-k-field-card{\n  display: grid;\n  align-content: start;\n  gap: 8px;\n  min-height: 126px;\n  padding: 16px;\n  border: 1px solid var(--line);\n  border-radius: 14px;\n  background: var(--panel);\n}\n.wrdn-k-field-card:hover{ background: #fffaf4; }\n.wrdn-k-field-card.is-selected{\n  border-color: #b98c60;\n  box-shadow: 0 0 0 3px rgba(185,140,96,.1);\n}\n.wrdn-k-field-card h3{ margin: 0; font-size: 16px; }\n.wrdn-k-field-card strong{ font-size: 27px; line-height: 1.15; }\n.wrdn-k-field-card p{ margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }\n.wrdn-k-field-detail{ min-height: 300px; padding: 18px; }\n.wrdn-k-field-detail-head{ padding-bottom: 14px; border-bottom: 1px solid var(--line); }\n.wrdn-k-field-detail-head .wrdn-p-section-title{ margin-bottom: 5px; }\n.wrdn-k-field-detail-head p{ margin: 0; font-size: 13px; }\n.wrdn-k-field-books{ display: grid; gap: 9px; margin-top: 14px; }\n.wrdn-k-field-book-row{\n  display: grid;\n  grid-template-columns: 44px minmax(0, 1fr) auto;\n  gap: 12px;\n  align-items: center;\n  padding: 9px 10px;\n  border: 1px solid var(--line);\n  border-radius: 11px;\n  background: #fff;\n}\n.wrdn-k-field-book-row:hover{ background: #fffaf4; }\n.wrdn-k-field-book-cover{\n  width: 44px;\n  height: 56px;\n  border-radius: 6px;\n  background-position: center;\n  background-size: cover;\n  background-color: #eee;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 4px;\n  text-align: center;\n  font-size: 8px;\n}\n.wrdn-k-field-book-copy{ display: grid; gap: 3px; min-width: 0; }\n.wrdn-k-field-book-copy strong,\n.wrdn-k-field-book-copy small{\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.wrdn-k-field-book-copy small{ color: var(--muted); }\n.wrdn-k-field-book-stats{\n  display: flex;\n  align-items: baseline;\n  gap: 9px;\n  color: var(--muted);\n  font-size: 11px;\n  white-space: nowrap;\n}\n.wrdn-k-field-book-stats b{ color: #28231f; font-size: 14px; }\n\n@media (max-width: 900px) {\n  .wrdn-k-source-card-grid{ grid-template-columns: 1fr; }\n  .wrdn-k-fields-layout{ grid-template-columns: 1fr; }\n}\n@media (max-width: 680px) {\n  .wrdn-k-field-grid{ grid-template-columns: 1fr 1fr; }\n  .wrdn-k-field-book-row{ grid-template-columns: 40px minmax(0, 1fr); }\n  .wrdn-k-field-book-cover{ width: 40px; height: 52px; }\n  .wrdn-k-field-book-stats{ grid-column: 2; flex-wrap: wrap; }\n  .wrdn-k-source-card{ grid-template-columns: 52px minmax(0, 1fr); }\n  .wrdn-k-source-card-cover{ width: 52px; height: 74px; }\n  .wrdn-k-record-book{ max-width: 65%; }\n}\n@media (max-width: 440px) {\n  .wrdn-k-field-grid{ grid-template-columns: 1fr; }\n}\n\n/* MVP3.10.19：严格固定布局；左右面板均为 600px，仅左侧列表允许滚动。 */\n\n/* MVP3.10.22：按窗口可用高度响应，并在回顾中心支持完整编辑。 */\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n@media (min-width: 1500px) {\n  \n  \n}\n\n@media (max-width: 1050px) {\n  \n  \n  \n}\n\n/* 13 英寸、1080p 缩放或矮窗口：仅在可用高度较小时启用紧凑模式。 */\n@media (max-height: 1050px) {\n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n}\n\n@media (max-height: 760px) {\n  \n  \n  \n  \n}\n\n\n/* 回顾中心：收获内容可直接编辑；阅读重点仅点击列表空白区域进入编辑。 */\n\n\n\n\n\n\n\n\n\n/* MVP3.10.25：按 Obsidian 内容区尺寸与缩放级别响应，不再依赖物理屏幕宽度。 */\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n@container wrdn-review-center (max-width: 1000px) {\n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n}\n\n/* Obsidian 放大或侧栏占用较多时，历史记录切换为顶部横向导航，详情获得完整宽度。 */\n@container wrdn-review-center (max-width: 820px) {\n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n}\n\n@container wrdn-review-center (max-width: 620px) {\n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n}\n\n/* 可用高度不足时，仅压缩垂直间距；不再依赖物理屏幕英寸。 */\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n/* MVP3.10.27：固定画布收窄并左对齐，兼容 Obsidian 原生右侧边栏展开。 */\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n/* MVP3.10.28：回顾中心整体重构。仅使用 wrdn-rc-*，不接管 Obsidian 原生滚动和边栏。 */\n:host(.wrdn-rc-host){\n  display: block;\n  width: 100%;\n  min-width: 0;\n  max-width: 100%;\n  overflow: visible;\n  container-type: inline-size;\n  container-name: wrdn-review-center-v2;\n}\n.wrdn-page.wrdn-rc-page{\n  --rc-height: clamp(520px, calc(100dvh - 170px), 640px);\n  width: 100%;\n  max-width: 1080px;\n  min-width: 0;\n  height: var(--rc-height);\n  min-height: var(--rc-height);\n  max-height: var(--rc-height);\n  margin: 0 auto;\n  padding: 10px 18px 18px;\n  display: grid;\n  grid-template-rows: 34px 52px minmax(0, 1fr);\n  gap: 12px;\n  overflow: hidden;\n}\n.wrdn-rc-back-row{\n  display: flex;\n  min-width: 0;\n  align-items: center;\n}\n.wrdn-rc-back-row .wrdn-p-back{\n  margin: 0;\n  padding: 4px 0;\n}\n.wrdn-rc-toolbar{\n  display: flex;\n  min-width: 0;\n  align-items: center;\n  justify-content: space-between;\n  gap: 14px;\n}\n.wrdn-rc-tabs{\n  display: flex;\n  min-width: 0;\n  align-items: center;\n  gap: 9px;\n}\n.wrdn-rc-tab{\n  appearance: none;\n  min-height: 42px;\n  padding: 0 19px;\n  border: 0;\n  border-radius: 999px;\n  background: #f2ede8;\n  color: #756d65;\n  cursor: pointer;\n}\n.wrdn-rc-tab.is-active{\n  background: var(--brown);\n  color: #fff;\n}\n.wrdn-rc-count{\n  flex: 0 0 auto;\n  color: var(--muted);\n  font-size: 12px;\n  white-space: nowrap;\n}\n.wrdn-rc-workspace{\n  display: grid;\n  min-width: 0;\n  min-height: 0;\n  grid-template-columns: 205px minmax(0, 1fr);\n  gap: 16px;\n  overflow: hidden;\n}\n.wrdn-rc-sidebar,\n.wrdn-rc-detail{\n  min-width: 0;\n  min-height: 0;\n  overflow: hidden;\n}\n.wrdn-rc-list{\n  display: grid;\n  min-height: 0;\n  max-height: 100%;\n  gap: 10px;\n  padding-right: 4px;\n  overflow-x: hidden;\n  overflow-y: auto;\n  scrollbar-width: thin;\n  scrollbar-color: #d8c4ae transparent;\n}\n.wrdn-rc-list::-webkit-scrollbar{ width: 6px; }\n.wrdn-rc-list::-webkit-scrollbar-thumb{ border-radius: 999px; background: #d8c4ae; }\n.wrdn-rc-period{\n  appearance: none;\n  position: relative;\n  display: flex;\n  width: 100%;\n  min-width: 0;\n  min-height: 58px;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n  padding: 0 15px;\n  border: 1px solid var(--line);\n  border-radius: 14px;\n  background: var(--panel);\n  color: var(--text, #28231f);\n  text-align: left;\n  cursor: pointer;\n  transition: border-color .16s ease, background .16s ease;\n}\n.wrdn-rc-period:hover{ border-color: #cfad87; background: #fffaf4; }\n.wrdn-rc-period.is-active{\n  min-height: 84px;\n  border-color: #c78d4d;\n  box-shadow: inset 0 0 0 1px rgba(199, 141, 77, .22);\n}\n.wrdn-rc-period-copy{\n  display: grid;\n  min-width: 0;\n  gap: 5px;\n}\n.wrdn-rc-period-copy strong,\n.wrdn-rc-period-copy small{\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.wrdn-rc-period-copy strong{ font-size: 15px; }\n.wrdn-rc-period-copy small{ color: var(--muted); font-size: 11px; font-weight: 500; }\n.wrdn-rc-period-state{\n  display: inline-flex;\n  width: 26px;\n  height: 26px;\n  flex: 0 0 26px;\n  align-items: center;\n  justify-content: center;\n  border-radius: 50%;\n  background: var(--brown);\n  color: #fff;\n  font-size: 13px;\n  font-weight: 750;\n}\n.wrdn-rc-period-chevron{\n  flex: 0 0 auto;\n  color: var(--muted);\n  font-size: 18px;\n  line-height: 1;\n}\n.wrdn-rc-detail{ display: flex; }\n.wrdn-rc-card{\n  display: grid;\n  width: 100%;\n  min-width: 0;\n  min-height: 0;\n  grid-template-rows: 64px minmax(0, 1fr);\n  overflow: hidden;\n  border: 1px solid var(--line);\n  border-radius: 17px;\n  background: var(--panel);\n}\n.wrdn-rc-card-header{\n  display: flex;\n  min-width: 0;\n  align-items: center;\n  padding: 0 22px;\n  border-bottom: 1px solid var(--line);\n  background: #fffdfa;\n}\n.wrdn-rc-card-title{\n  display: flex;\n  min-width: 0;\n  align-items: center;\n  gap: 12px;\n}\n.wrdn-rc-card-title h2{\n  min-width: 0;\n  margin: 0;\n  overflow: hidden;\n  color: #28231f;\n  font-size: 21px;\n  line-height: 1.3;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.wrdn-rc-card-title > span{\n  display: inline-flex;\n  min-height: 28px;\n  flex: 0 0 auto;\n  align-items: center;\n  padding: 0 11px;\n  border-radius: 999px;\n  background: #f5ede4;\n  color: #9a652f;\n  font-size: 12px;\n  font-weight: 620;\n  white-space: nowrap;\n}\n.wrdn-rc-card-body{\n  display: grid;\n  min-width: 0;\n  min-height: 0;\n  grid-template-columns: minmax(0, 1.05fr) minmax(270px, .95fr);\n  overflow: hidden;\n}\n.wrdn-rc-section{\n  display: grid;\n  min-width: 0;\n  min-height: 0;\n  padding: 18px 20px;\n  overflow: hidden;\n}\n.wrdn-rc-gain{\n  grid-template-rows: auto minmax(0, 1fr) auto;\n  background: #fffdfa;\n}\n.wrdn-rc-focus{\n  grid-template-rows: auto minmax(0, 1fr) auto;\n  border-left: 1px solid var(--line);\n  background: #fdfbf8;\n}\n.wrdn-rc-section-heading{\n  display: flex;\n  min-width: 0;\n  align-items: center;\n  gap: 9px;\n  margin-bottom: 13px;\n}\n.wrdn-rc-section-heading .wrdn-p-icon{\n  width: 27px;\n  height: 27px;\n  padding: 6px;\n  border-radius: 50%;\n  background: #f7ebdc;\n  color: #b8792e;\n}\n.wrdn-rc-section-heading h3{\n  margin: 0;\n  color: #28231f;\n  font-size: 15px;\n}\n.wrdn-rc-gain-content{\n  min-width: 0;\n  min-height: 0;\n  padding: 16px 18px;\n  overflow: auto;\n  border: 1px solid #eadbc9;\n  border-radius: 14px;\n  background: #fbf5ec;\n  color: #28231f;\n  font-size: 14px;\n  line-height: 1.8;\n  white-space: pre-wrap;\n  cursor: text;\n}\n.wrdn-rc-gain-content:hover,\n.wrdn-rc-gain-content:focus-visible,\n.wrdn-rc-focus-content:hover,\n.wrdn-rc-focus-content:focus-visible{\n  outline: none;\n  border-color: #c89a69;\n  box-shadow: 0 0 0 2px rgba(184, 121, 46, .08);\n}\n.wrdn-rc-gain-content.is-empty{ color: var(--muted); }\n.wrdn-rc-metrics{\n  display: grid;\n  min-width: 0;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  margin-top: 12px;\n  overflow: hidden;\n  border: 1px solid var(--line);\n  border-radius: 12px;\n  background: #fffdfa;\n}\n.wrdn-rc-metric{\n  display: flex;\n  min-width: 0;\n  min-height: 62px;\n  align-items: center;\n  justify-content: center;\n  flex-direction: column;\n  border-right: 1px solid var(--line);\n}\n.wrdn-rc-metric:last-child{ border-right: 0; }\n.wrdn-rc-metric strong{\n  max-width: 100%;\n  overflow: hidden;\n  color: #28231f;\n  font-size: 19px;\n  line-height: 1;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.wrdn-rc-metric strong small{ margin-left: 2px; font-size: 9px; font-weight: 600; }\n.wrdn-rc-metric > span{ margin-top: 6px; color: var(--muted); font-size: 9px; white-space: nowrap; }\n.wrdn-rc-focus-content{\n  min-width: 0;\n  min-height: 0;\n  overflow: auto;\n  border: 1px solid transparent;\n  border-radius: 13px;\n  cursor: text;\n}\n.wrdn-rc-focus-list{\n  display: grid;\n  gap: 9px;\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n.wrdn-rc-focus-list li{\n  display: flex;\n  min-width: 0;\n  min-height: 44px;\n  align-items: flex-start;\n  gap: 10px;\n  padding: 10px 12px;\n  border: 1px solid #eadbc9;\n  border-radius: 12px;\n  background: #fff;\n  color: #28231f;\n  font-size: 13px;\n  line-height: 1.55;\n}\n.wrdn-rc-focus-list li > span:last-child{ min-width: 0; overflow-wrap: anywhere; }\n.wrdn-rc-focus-list li.is-checked > span:last-child{ color: var(--muted); text-decoration: line-through; }\n.wrdn-rc-check{\n  appearance: none;\n  display: inline-flex;\n  width: 21px;\n  height: 21px;\n  flex: 0 0 21px;\n  align-items: center;\n  justify-content: center;\n  margin: 0;\n  padding: 0;\n  border: 1px solid #d8bea2;\n  border-radius: 6px;\n  background: #fff;\n  color: #fff;\n  cursor: pointer;\n  font-size: 11px;\n  font-weight: 750;\n}\n.wrdn-rc-focus-list li.is-checked .wrdn-rc-check{ border-color: #b8792e; background: #b8792e; }\n.wrdn-rc-focus-empty{ margin: 0; padding: 12px; color: var(--muted); font-size: 13px; }\n.wrdn-rc-progress{\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-top: 12px;\n  padding-top: 11px;\n  border-top: 1px solid var(--line);\n  color: var(--muted);\n  font-size: 12px;\n}\n.wrdn-rc-progress > span:first-child{\n  display: inline-flex;\n  width: 19px;\n  height: 19px;\n  align-items: center;\n  justify-content: center;\n  border: 1px solid #c9b59f;\n  border-radius: 50%;\n  font-size: 10px;\n}\n.wrdn-rc-editor{\n  display: grid;\n  min-width: 0;\n  min-height: 0;\n  grid-template-rows: minmax(0, 1fr) auto;\n  gap: 10px;\n}\n.wrdn-rc-editor-input{\n  width: 100%;\n  min-width: 0;\n  min-height: 0;\n  resize: none;\n  padding: 14px 16px;\n  border: 1px solid #c89a69;\n  border-radius: 13px;\n  outline: none;\n  background: #fff;\n  color: #28231f;\n  font-size: 13px;\n  line-height: 1.7;\n  font-family: inherit;\n}\n.wrdn-rc-editor-input:focus{ box-shadow: 0 0 0 3px rgba(184, 121, 46, .10); }\n.wrdn-rc-editor-actions{\n  display: flex;\n  justify-content: flex-end;\n  gap: 8px;\n}\n.wrdn-rc-editor-button{\n  appearance: none;\n  min-height: 30px;\n  padding: 0 13px;\n  border-radius: 8px;\n  cursor: pointer;\n  font-size: 12px;\n  font-weight: 620;\n}\n.wrdn-rc-editor-button.is-secondary{ border: 1px solid var(--line); background: #fff; color: #49372a; }\n.wrdn-rc-editor-button.is-primary{ border: 1px solid var(--brown); background: var(--brown); color: #fff; }\n.wrdn-rc-empty{\n  display: flex;\n  min-height: 120px;\n  align-items: center;\n  justify-content: center;\n  padding: 18px;\n  border: 1px dashed var(--line);\n  border-radius: 14px;\n  color: var(--muted);\n  text-align: center;\n}\n\n@container wrdn-review-center-v2 (max-width: 860px) {\n  .wrdn-page.wrdn-rc-page{\n    padding-inline: 12px;\n  }\n  .wrdn-rc-workspace{\n    grid-template-columns: 178px minmax(0, 1fr);\n    gap: 12px;\n  }\n  .wrdn-rc-card-body{\n    grid-template-columns: minmax(0, 1fr) minmax(230px, .9fr);\n  }\n  .wrdn-rc-card-header{ padding-inline: 18px; }\n  .wrdn-rc-card-title h2{ font-size: 18px; }\n  .wrdn-rc-card-title > span{ font-size: 10px; }\n  .wrdn-rc-section{ padding: 15px 16px; }\n  .wrdn-rc-period{ padding-inline: 12px; }\n  .wrdn-rc-period-copy strong{ font-size: 13px; }\n}\n\n@container wrdn-review-center-v2 (max-width: 670px) {\n  .wrdn-page.wrdn-rc-page{\n    --rc-height: clamp(560px, calc(100dvh - 145px), 680px);\n    grid-template-rows: 32px 46px minmax(0, 1fr);\n    gap: 9px;\n  }\n  .wrdn-rc-workspace{\n    grid-template-columns: 145px minmax(0, 1fr);\n    gap: 10px;\n  }\n  .wrdn-rc-period{\n    min-height: 50px;\n    padding-inline: 10px;\n  }\n  .wrdn-rc-period.is-active{ min-height: 68px; }\n  .wrdn-rc-period-copy small,\n.wrdn-rc-count{ display: none; }\n  .wrdn-rc-period-state{ width: 22px; height: 22px; flex-basis: 22px; }\n  .wrdn-rc-card{\n    grid-template-rows: 58px minmax(0, 1fr);\n  }\n  .wrdn-rc-card-title{ gap: 7px; }\n  .wrdn-rc-card-title h2{ font-size: 16px; }\n  .wrdn-rc-card-title > span{ min-height: 24px; padding-inline: 8px; }\n  .wrdn-rc-card-body{\n    grid-template-columns: minmax(0, 1fr) minmax(190px, .9fr);\n  }\n  .wrdn-rc-section{ padding: 12px; }\n  .wrdn-rc-section-heading{ margin-bottom: 9px; }\n  .wrdn-rc-section-heading .wrdn-p-icon{ width: 23px; height: 23px; padding: 5px; }\n  .wrdn-rc-section-heading h3{ font-size: 13px; }\n  .wrdn-rc-gain-content{ padding: 12px; font-size: 12px; }\n  .wrdn-rc-metric{ min-height: 54px; }\n  .wrdn-rc-metric strong{ font-size: 16px; }\n  .wrdn-rc-focus-list li{ min-height: 40px; padding: 8px 9px; font-size: 12px; }\n}\n\n@container wrdn-review-center-v2 (max-width: 540px) {\n  .wrdn-page.wrdn-rc-page{\n    height: auto;\n    min-height: 0;\n    max-height: none;\n    overflow: visible;\n  }\n  .wrdn-rc-toolbar{ align-items: flex-start; flex-direction: column; }\n  .wrdn-rc-count{ display: block; }\n  .wrdn-rc-workspace{\n    grid-template-columns: 1fr;\n    overflow: visible;\n  }\n  .wrdn-rc-sidebar{ overflow: visible; }\n  .wrdn-rc-list{\n    grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));\n    max-height: 180px;\n  }\n  .wrdn-rc-detail{ min-height: 520px; }\n  .wrdn-rc-card-body{ grid-template-columns: 1fr; overflow: auto; }\n  .wrdn-rc-focus{ border-left: 0; border-top: 1px solid var(--line); }\n}\n\n\n/* --- 书籍详情页重构版 --- */\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n.wrdn-p-icon.is-thought{\n  width: 32px;\n  height: 32px;\n  min-width: 32px;\n  border-radius: 50%;\n  border: 1px solid #d7bea0;\n  color: #9a6a34;\n  background: #fff;\n}\n.wrdn-p-icon.is-thought svg{ width: 17px; height: 17px; }\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n@media (max-width: 980px) {\n  \n  \n  \n  \n  \n  \n  \n}\n@media (max-width: 720px) {\n  \n  \n  \n  \n  \n  \n}\n\n/* --- 书籍详情页：三 Tab 定稿版严格对齐修正 --- */\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n@media (max-width: 1180px) {\n  \n  \n  \n  \n}\n\n@media (max-width: 980px) {\n  \n  \n  \n  \n}\n\n@media (max-width: 720px) {\n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n}\n\n/* --- 书籍详情页：按最终效果图修正 --- */\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n@media (max-width: 1200px) {\n  \n  \n}\n\n@media (max-width: 980px) {\n  \n  \n  \n}\n\n@media (max-width: 720px) {\n  \n  \n  \n  \n  \n}\n\n/* --- 书籍详情页：参考静态效果图最终重构版 --- */\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n@media (max-width: 1320px) {\n  \n  \n  \n  \n}\n\n@media (max-width: 1040px) {\n  \n  \n  \n}\n\n@media (max-width: 720px) {\n  \n  \n  \n  \n  \n  \n  \n  \n  \n}\n\n/* --- 书籍详情页：顶部压缩 + 划线想法极简版 --- */\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n@media (max-width: 1320px) {\n  \n  \n  \n  \n}\n\n@media (max-width: 1040px) {\n  \n  \n}\n\n/* --- 书籍详情页：进一步压缩顶部，仅下半区滚动 --- */\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n@media (max-width: 1320px) {\n  \n  \n  \n  \n}\n\n/* --- 书籍详情页：锁定整页，仅内容区滚动 --- */\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n/* ========================================================================== */\n/* Book detail v2 — focused rewrite. The page itself is locked; only the      */\n/* highlight/thought pane scrolls. The visual language and content structure  */\n/* remain unchanged, while the upper summary is deliberately compressed.      */\n/* ========================================================================== */\n.wrdn-page.wrdn-bd2-page{\n  box-sizing: border-box;\n  width: 100%;\n  max-width: none;\n  height: 100%;\n  min-width: 0;\n  min-height: 0;\n  max-height: none;\n  margin: 0;\n  padding: 10px 18px 10px;\n  overflow: hidden;\n  overscroll-behavior: none;\n  display: grid;\n  grid-template-rows: 30px clamp(156px, 18dvh, 176px) minmax(0, 1fr);\n  gap: 8px;\n  color: #2f2823;\n  background: var(--background-primary, #fff);\n  contain: layout paint;\n}\n\n.wrdn-bd2-page *,\n.wrdn-bd2-page *::before,\n.wrdn-bd2-page *::after{\n  box-sizing: border-box;\n}\n\n.wrdn-bd2-header{\n  min-width: 0;\n  min-height: 0;\n  display: flex;\n  align-items: center;\n}\n\n.wrdn-bd2-header .wrdn-p-back{\n  padding: 3px 0;\n  font-size: 14px;\n}\n\n.wrdn-bd2-hero{\n  min-width: 0;\n  min-height: 0;\n  display: grid;\n  grid-template-columns: 112px minmax(0, 1fr) 284px;\n  align-items: center;\n  gap: 22px;\n  padding: 10px 18px;\n  overflow: hidden;\n  border: 1px solid #eadfce;\n  border-radius: 18px;\n  background: linear-gradient(180deg, #fffdfa 0%, #fffcf8 100%);\n  box-shadow: 0 6px 20px rgba(77, 53, 29, 0.06);\n}\n\n.wrdn-bd2-cover{\n  width: 112px;\n  height: 144px;\n  min-height: 0;\n  border-radius: 11px;\n  background-position: center;\n  background-size: cover;\n  background-color: #efe8df;\n  box-shadow: 0 9px 22px rgba(45, 31, 20, 0.12);\n}\n\n.wrdn-bd2-identity{\n  min-width: 0;\n  min-height: 0;\n  height: 100%;\n  display: grid;\n  grid-template-rows: auto auto auto auto minmax(0, 1fr);\n  align-content: center;\n  gap: 3px;\n  padding: 1px 0;\n}\n\n.wrdn-bd2-status{\n  justify-self: start;\n  margin-bottom: 1px;\n}\n\n.wrdn-bd2-title{\n  margin: 0;\n  max-width: 100%;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 30px;\n  line-height: 1.12;\n  letter-spacing: -0.02em;\n  color: #2a231f;\n}\n\n\n\n.wrdn-bd2-author{\n  display: inline-flex;\n  align-items: center;\n  gap: 7px;\n  width: fit-content;\n  margin-top: 1px;\n  font-size: 13px;\n  color: #766b61;\n}\n\n.wrdn-bd2-author .wrdn-p-icon{\n  width: 15px;\n  height: 15px;\n  color: var(--brown, #93602c);\n}\n\n.wrdn-bd2-progress{\n  align-self: end;\n  display: grid;\n  gap: 5px;\n  min-width: 0;\n  padding-top: 4px;\n}\n\n.wrdn-bd2-progress-head{\n  display: flex;\n  align-items: flex-end;\n  justify-content: space-between;\n  gap: 16px;\n  color: #8a7d71;\n  font-size: 12px;\n}\n\n.wrdn-bd2-progress-head strong{\n  color: #2d2723;\n  font-size: 22px;\n  line-height: 1;\n}\n\n.wrdn-bd2-progress .wrdn-p-progress{\n  height: 6px;\n}\n\n.wrdn-bd2-progress small{\n  overflow: hidden;\n  color: #918477;\n  font-size: 11px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.wrdn-bd2-side{\n  min-width: 0;\n  min-height: 0;\n  height: 100%;\n  display: grid;\n  grid-template-rows: minmax(0, 1fr) 40px;\n  align-items: center;\n  gap: 10px;\n  padding-left: 18px;\n  border-left: 1px solid #eadfce;\n}\n\n.wrdn-bd2-stats{\n  min-width: 0;\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  align-items: center;\n}\n\n.wrdn-bd2-stat{\n  min-width: 0;\n  display: grid;\n  justify-items: center;\n  gap: 3px;\n  padding: 0 10px;\n  border-right: 1px solid #eadfce;\n  color: #7a6e63;\n}\n\n.wrdn-bd2-stat:last-child{\n  border-right: 0;\n}\n\n.wrdn-bd2-stat > .wrdn-p-icon{\n  width: 17px;\n  height: 17px;\n  color: var(--brown, #93602c);\n}\n\n.wrdn-bd2-stat > span{\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 11px;\n}\n\n.wrdn-bd2-stat-value{\n  display: flex;\n  align-items: baseline;\n  justify-content: center;\n  gap: 3px;\n  white-space: nowrap;\n  color: #2d2723;\n}\n\n.wrdn-bd2-stat-value strong{\n  font-size: 20px;\n  line-height: 1;\n}\n\n.wrdn-bd2-stat-value small{\n  font-size: 10px;\n  color: #766b62;\n}\n\n.wrdn-bd2-continue{\n  width: 100%;\n  min-height: 40px;\n  justify-content: center;\n  border-radius: 11px;\n  font-size: 14px;\n}\n\n.wrdn-bd2-continue .wrdn-p-icon{\n  width: 16px;\n  height: 16px;\n}\n\n.wrdn-bd2-workspace{\n  min-width: 0;\n  min-height: 0;\n  overflow: hidden;\n  display: grid;\n  grid-template-rows: 40px minmax(0, 1fr);\n}\n\n.wrdn-bd2-tabs{\n  min-width: 0;\n  display: flex;\n  align-items: end;\n  gap: 34px;\n  overflow: hidden;\n  border-bottom: 1px solid #eadfce;\n}\n\n.wrdn-bd2-tab{\n  appearance: none;\n  position: relative;\n  height: 40px;\n  padding: 0 1px 10px;\n  border: 0;\n  background: transparent;\n  color: #746a61;\n  font-size: 16px;\n  cursor: pointer;\n}\n\n.wrdn-bd2-tab.is-active{\n  color: var(--brown-dark, #75471f);\n  font-weight: 700;\n}\n\n.wrdn-bd2-tab.is-active::after{\n  content: \"\";\n  position: absolute;\n  right: 0;\n  bottom: -1px;\n  left: 0;\n  height: 2px;\n  border-radius: 2px;\n  background: var(--brown, #93602c);\n}\n\n.wrdn-bd2-tab:focus,\n.wrdn-bd2-tab:focus-visible{\n  outline: none;\n  box-shadow: none;\n}\n\n.wrdn-bd2-content{\n  min-width: 0;\n  min-height: 0;\n  height: 100%;\n  padding: 10px 7px 8px 0;\n  overflow: hidden;\n  overscroll-behavior: none;\n}\n\n.wrdn-bd2-content.is-scrollable{\n  overflow-y: auto;\n  overflow-x: hidden;\n  overscroll-behavior: contain;\n  touch-action: pan-y;\n  scrollbar-gutter: stable;\n  scrollbar-width: thin;\n  scrollbar-color: #b88c5b #f5eee5;\n}\n\n.wrdn-bd2-content.is-scrollable::-webkit-scrollbar{\n  width: 9px;\n}\n\n.wrdn-bd2-content.is-scrollable::-webkit-scrollbar-track{\n  border-radius: 999px;\n  background: #f5eee5;\n}\n\n.wrdn-bd2-content.is-scrollable::-webkit-scrollbar-thumb{\n  min-height: 48px;\n  border: 2px solid #f5eee5;\n  border-radius: 999px;\n  background: #b88c5b;\n}\n\n.wrdn-bd2-list{\n  min-width: 0;\n  display: grid;\n  gap: 10px;\n}\n\n.wrdn-bd2-card{\n  min-width: 0;\n  margin: 0;\n  border: 1px solid #eadfce;\n  border-radius: 14px;\n  background: #fffdfa;\n  box-shadow: 0 3px 12px rgba(72, 50, 28, 0.035);\n}\n\n.wrdn-bd2-highlight{\n  padding: 14px 20px;\n  border-left: 4px solid #d7ae63;\n}\n\n.wrdn-bd2-highlight p,\n.wrdn-bd2-thought p{\n  margin: 0;\n  color: #342d28;\n  font-size: 15px;\n  line-height: 1.75;\n}\n\n.wrdn-bd2-thought{\n  padding: 12px 16px 14px;\n}\n\n.wrdn-bd2-quote{\n  margin: 0 0 9px;\n  padding: 7px 12px;\n  overflow: hidden;\n  border: 1px solid #eee1d0;\n  border-left: 0;\n  border-radius: 9px;\n  background: #fcf6ee;\n  color: #966f42;\n  font-size: 13px;\n  line-height: 1.55;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.wrdn-bd2-thought-text{\n  padding: 0 3px;\n}\n\n.wrdn-bd2-empty{\n  display: grid;\n  place-items: center;\n  height: 100%;\n  color: #9b8d80;\n}\n\n.wrdn-bd2-review{\n  height: 100%;\n  min-height: 0;\n  display: grid;\n  grid-template-rows: minmax(0, 1fr) auto;\n  gap: 10px;\n}\n\n.wrdn-bd2-review-panel,\n.wrdn-bd2-review-editor{\n  position: relative;\n  min-width: 0;\n  min-height: 0;\n  height: 100%;\n  overflow: hidden;\n  border: 1px solid #e5d6c2;\n  border-radius: 15px;\n  background: linear-gradient(180deg, #fffdfa 0%, #fbf6ef 100%);\n}\n\n.wrdn-bd2-review-panel{\n  padding: 20px 50px 20px 22px;\n  cursor: text;\n}\n\n.wrdn-bd2-review-copy{\n  height: 100%;\n  overflow: hidden;\n  color: #342d28;\n  font-size: 15px;\n  line-height: 1.85;\n  white-space: pre-wrap;\n}\n\n\n\n.wrdn-bd2-review-editor{\n  display: grid;\n  grid-template-rows: minmax(0, 1fr) auto;\n  gap: 10px;\n  padding: 18px 20px;\n}\n\n.wrdn-bd2-review-textarea{\n  min-width: 0;\n  min-height: 0;\n  width: 100%;\n  height: 100%;\n  padding: 0;\n  overflow-y: auto;\n  resize: none;\n  border: 0;\n  background: transparent;\n  color: #342d28;\n  font-size: 15px;\n  line-height: 1.85;\n}\n\n.wrdn-bd2-review-textarea:focus{\n  outline: none;\n  box-shadow: none;\n}\n\n.wrdn-bd2-review-hint{\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  min-height: 22px;\n  color: #8e8072;\n  font-size: 13px;\n}\n\n.wrdn-bd2-review-hint .wrdn-p-icon{\n  width: 16px;\n  height: 16px;\n  color: var(--brown, #93602c);\n}\n\n@media (max-width: 1180px) {\n  .wrdn-page.wrdn-bd2-page{\n    grid-template-rows: 30px clamp(150px, 17dvh, 166px) minmax(0, 1fr);\n    padding: 9px 14px;\n  }\n  .wrdn-bd2-hero{\n    grid-template-columns: 104px minmax(0, 1fr) 250px;\n    gap: 18px;\n    padding: 9px 15px;\n  }\n  .wrdn-bd2-cover{\n    width: 104px;\n    height: 134px;\n  }\n  .wrdn-bd2-title{ font-size: 26px; }\n  \n  .wrdn-bd2-side{ padding-left: 15px; }\n  .wrdn-bd2-stat{ padding: 0 7px; }\n  .wrdn-bd2-stat-value strong{ font-size: 19px; }\n}\n\n@media (max-width: 880px) {\n  .wrdn-page.wrdn-bd2-page{\n    grid-template-rows: 30px 196px minmax(0, 1fr);\n  }\n  .wrdn-bd2-hero{\n    grid-template-columns: 96px minmax(0, 1fr);\n    grid-template-rows: minmax(0, 1fr) 50px;\n    gap: 10px 16px;\n  }\n  .wrdn-bd2-cover{\n    width: 96px;\n    height: 124px;\n  }\n  .wrdn-bd2-title{ font-size: 24px; }\n  .wrdn-bd2-progress{ padding-top: 2px; }\n  .wrdn-bd2-side{\n    grid-column: 1 / -1;\n    height: 50px;\n    grid-template-columns: minmax(0, 1fr) 210px;\n    grid-template-rows: 1fr;\n    gap: 12px;\n    padding: 8px 0 0;\n    border-top: 1px solid #eadfce;\n    border-left: 0;\n  }\n  .wrdn-bd2-stats{ height: 38px; }\n  .wrdn-bd2-continue{ min-height: 38px; }\n}\n\n@media (max-height: 720px) and (min-width: 881px) {\n  .wrdn-page.wrdn-bd2-page{\n    grid-template-rows: 28px 146px minmax(0, 1fr);\n    gap: 7px;\n    padding-top: 7px;\n    padding-bottom: 7px;\n  }\n  .wrdn-bd2-header .wrdn-p-back{ font-size: 13px; }\n  .wrdn-bd2-hero{\n    grid-template-columns: 96px minmax(0, 1fr) 250px;\n    gap: 16px;\n    padding: 8px 14px;\n  }\n  .wrdn-bd2-cover{\n    width: 96px;\n    height: 124px;\n  }\n  .wrdn-bd2-title{ font-size: 25px; }\n  \n  .wrdn-bd2-progress-head strong{ font-size: 20px; }\n  .wrdn-bd2-side{\n    grid-template-rows: minmax(0, 1fr) 36px;\n    gap: 7px;\n  }\n  .wrdn-bd2-continue{ min-height: 36px; }\n}\n\n@media (max-width: 880px) and (max-height: 720px) {\n  .wrdn-page.wrdn-bd2-page{\n    grid-template-rows: 28px 184px minmax(0, 1fr);\n  }\n}\n\n\n/* ========================================================================== */\n/* MVP3.10.33 — unified page shell + book-detail title correction.            */\n/* Functional pages use the same 1024px shell and 18px horizontal gutter as  */\n/* the reading dashboard. The book-detail subtitle is intentionally omitted   */\n/* by the renderer; long titles stay on one line and end with an ellipsis.    */\n/* ========================================================================== */\n.wrdn-page.wrdn-bd2-page{\n  width: min(100%, var(--wrdn-page-max-width, 1024px)) !important;\n  max-width: var(--wrdn-page-max-width, 1024px) !important;\n  margin-right: auto !important;\n  margin-left: auto !important;\n  padding-right: var(--wrdn-page-gutter, 18px) !important;\n  padding-left: var(--wrdn-page-gutter, 18px) !important;\n}\n\n.wrdn-page.wrdn-bd2-page{\n  grid-template-rows: 30px clamp(156px, 18dvh, 176px) minmax(0, 1fr);\n}\n\n.wrdn-bd2-identity{\n  grid-template-rows: auto auto auto minmax(0, 1fr);\n  gap: 4px;\n}\n\n.wrdn-bd2-title{\n  display: block;\n  width: 100%;\n  min-width: 0;\n  max-width: 100%;\n  padding-right: 6px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.wrdn-bd2-author{\n  min-width: 0;\n  overflow: hidden;\n  white-space: nowrap;\n}\n\n.wrdn-bd2-author > span{\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.wrdn-bd2-progress{\n  min-height: 0;\n  align-self: end;\n}\n\n@media (max-width: 1040px) {\n  .wrdn-page.wrdn-bd2-page{\n    width: 100% !important;\n  }\n}\n\n/* ========================================================================== */\n/* MVP3.10.34 — book-detail experience polish.                                */\n/* Restores homepage-like side breathing room, gives the summary card a more  */\n/* comfortable height, and keeps scrolling limited to highlights/thoughts.    */\n/* ========================================================================== */\n.wrdn-page.wrdn-bd2-page{\n  width: min(100%, var(--wrdn-page-max-width, 1024px)) !important;\n  max-width: var(--wrdn-page-max-width, 1024px) !important;\n  padding: 10px 42px 12px !important;\n  grid-template-rows: 32px clamp(202px, 23dvh, 222px) minmax(0, 1fr) !important;\n  gap: 10px !important;\n}\n\n.wrdn-bd2-hero{\n  grid-template-columns: 128px minmax(0, 1fr) 300px !important;\n  gap: 26px !important;\n  padding: 16px 22px !important;\n  border-radius: 18px !important;\n}\n\n.wrdn-bd2-cover{\n  width: 128px !important;\n  height: 164px !important;\n  border-radius: 12px !important;\n}\n\n.wrdn-bd2-identity{\n  grid-template-rows: auto auto auto minmax(0, 1fr) !important;\n  align-content: center !important;\n  gap: 6px !important;\n  padding: 3px 0 !important;\n}\n\n.wrdn-bd2-title{\n  font-size: 32px !important;\n  line-height: 1.14 !important;\n}\n\n.wrdn-bd2-author{\n  margin-top: 0 !important;\n  font-size: 13px !important;\n}\n\n.wrdn-bd2-progress{\n  align-self: end !important;\n  gap: 7px !important;\n  padding-top: 10px !important;\n}\n\n.wrdn-bd2-progress-head{\n  justify-content: flex-end !important;\n  min-height: 24px !important;\n  margin: 0 !important;\n}\n\n.wrdn-bd2-progress-head strong{\n  font-size: 25px !important;\n}\n\n.wrdn-bd2-progress .wrdn-p-progress{\n  height: 7px !important;\n}\n\n.wrdn-bd2-progress small{\n  font-size: 12px !important;\n}\n\n.wrdn-bd2-side{\n  grid-template-rows: minmax(0, 1fr) 46px !important;\n  gap: 14px !important;\n  padding-left: 22px !important;\n}\n\n.wrdn-bd2-stat{\n  gap: 5px !important;\n  padding: 0 11px !important;\n}\n\n.wrdn-bd2-stat > .wrdn-p-icon{\n  width: 18px !important;\n  height: 18px !important;\n}\n\n.wrdn-bd2-stat > span{\n  font-size: 12px !important;\n}\n\n.wrdn-bd2-stat-value strong{\n  font-size: 22px !important;\n}\n\n.wrdn-bd2-stat-value small{\n  font-size: 11px !important;\n}\n\n.wrdn-bd2-continue{\n  min-height: 46px !important;\n  font-size: 14px !important;\n}\n\n.wrdn-bd2-workspace{\n  grid-template-rows: 42px minmax(0, 1fr) !important;\n}\n\n.wrdn-bd2-tabs{\n  gap: 38px !important;\n}\n\n.wrdn-bd2-tab{\n  height: 42px !important;\n  padding-bottom: 11px !important;\n}\n\n.wrdn-bd2-content{\n  padding-top: 11px !important;\n}\n\n.wrdn-bd2-review-panel{\n  padding: 20px 22px !important;\n}\n\n\n\n@media (max-width: 1180px) {\n  .wrdn-page.wrdn-bd2-page{\n    padding-right: 32px !important;\n    padding-left: 32px !important;\n    grid-template-rows: 30px 196px minmax(0, 1fr) !important;\n  }\n  .wrdn-bd2-hero{\n    grid-template-columns: 116px minmax(0, 1fr) 272px !important;\n    gap: 22px !important;\n    padding: 14px 18px !important;\n  }\n  .wrdn-bd2-cover{\n    width: 116px !important;\n    height: 150px !important;\n  }\n  .wrdn-bd2-title{ font-size: 29px !important; }\n  .wrdn-bd2-side{ padding-left: 18px !important; }\n}\n\n@media (max-width: 880px) {\n  .wrdn-page.wrdn-bd2-page{\n    padding-right: 22px !important;\n    padding-left: 22px !important;\n    grid-template-rows: 30px 214px minmax(0, 1fr) !important;\n  }\n  .wrdn-bd2-hero{\n    grid-template-columns: 104px minmax(0, 1fr) !important;\n    grid-template-rows: minmax(0, 1fr) 54px !important;\n    gap: 12px 18px !important;\n    padding: 14px 16px !important;\n  }\n  .wrdn-bd2-cover{\n    width: 104px !important;\n    height: 134px !important;\n  }\n  .wrdn-bd2-title{ font-size: 26px !important; }\n  .wrdn-bd2-side{\n    height: 54px !important;\n    grid-template-columns: minmax(0, 1fr) 210px !important;\n    grid-template-rows: 1fr !important;\n    gap: 12px !important;\n    padding: 8px 0 0 !important;\n  }\n}\n\n@media (max-height: 720px) and (min-width: 881px) {\n  .wrdn-page.wrdn-bd2-page{\n    grid-template-rows: 28px 186px minmax(0, 1fr) !important;\n  }\n  .wrdn-bd2-hero{\n    grid-template-columns: 108px minmax(0, 1fr) 266px !important;\n    padding: 12px 17px !important;\n  }\n  .wrdn-bd2-cover{\n    width: 108px !important;\n    height: 140px !important;\n  }\n}\n\n/* ========================================================================== */\n/* MVP3.10.35 — WeRead record timestamps.                                     */\n/* Highlight and thought creation times are shown quietly on the right edge,  */\n/* without changing the existing card hierarchy or scroll behavior.           */\n/* ========================================================================== */\n.wrdn-bd2-highlight-row,\n.wrdn-bd2-thought-head{\n  min-width: 0;\n  display: flex;\n  align-items: center;\n  gap: 18px;\n}\n\n.wrdn-bd2-highlight-row > p,\n.wrdn-bd2-thought-head > .wrdn-bd2-quote{\n  min-width: 0;\n  flex: 1 1 auto;\n}\n\n.wrdn-bd2-record-time{\n  flex: 0 0 auto;\n  margin-left: auto;\n  color: #9a8c7f;\n  font-size: 12px;\n  line-height: 1.4;\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n\n.wrdn-bd2-thought-head{\n  margin-bottom: 9px;\n}\n\n.wrdn-bd2-thought-head > .wrdn-bd2-quote{\n  margin: 0;\n}\n\n@media (max-width: 760px) {\n  .wrdn-bd2-highlight-row,\n.wrdn-bd2-thought-head{\n    gap: 10px;\n    align-items: flex-start;\n  }\n\n  .wrdn-bd2-record-time{\n    padding-top: 2px;\n    font-size: 11px;\n  }\n}\n\n\n/* ========================================================================== */\n/* MVP3.10.36 — unified surfaces across the three book-detail tabs.           */\n/* Highlight cards, thought cards/quotes and the review panel now share the   */\n/* same background, border and shadow so switching tabs feels continuous.     */\n/* ========================================================================== */\n.wrdn-page.wrdn-bd2-page{\n  --wrdn-bd2-surface-bg: #fffdfa;\n  --wrdn-bd2-surface-border: #eadfce;\n  --wrdn-bd2-surface-shadow: 0 3px 12px rgba(72, 50, 28, 0.035);\n}\n\n.wrdn-bd2-card,\n.wrdn-bd2-review-panel,\n.wrdn-bd2-review-editor{\n  border-color: var(--wrdn-bd2-surface-border) !important;\n  background: var(--wrdn-bd2-surface-bg) !important;\n  box-shadow: var(--wrdn-bd2-surface-shadow) !important;\n}\n\n.wrdn-bd2-quote{\n  border-color: var(--wrdn-bd2-surface-border) !important;\n  background: var(--wrdn-bd2-surface-bg) !important;\n}\n\n/* ========================================================================== */\n/* MVP3.10.37 — unified highlight/thought card structure.                     */\n/* Highlights now use the same outer container as thoughts. The quoted source */\n/* inside a thought is rendered directly on the card, without a nested frame. */\n/* ========================================================================== */\n.wrdn-bd2-highlight,\n.wrdn-bd2-thought{\n  padding: 14px 20px !important;\n  border-left-width: 1px !important;\n  border-left-color: var(--wrdn-bd2-surface-border, #eadfce) !important;\n}\n\n.wrdn-bd2-quote{\n  margin: 0 !important;\n  padding: 0 !important;\n  border: 0 !important;\n  border-radius: 0 !important;\n  background: transparent !important;\n  box-shadow: none !important;\n}\n\n.wrdn-bd2-thought-head{\n  margin-bottom: 10px !important;\n}\n\n.wrdn-bd2-thought-text{\n  padding: 0 !important;\n}\n"}};

const __WRD_SYNC_PLUGIN = __WRD_SYNC_EXPORTS.default || __WRD_SYNC_EXPORTS;
if (typeof __WRD_UI_EXPORTS.installUiRuntime !== "function") {
  throw new Error("Weread Reading Dashboard: UI installer missing");
}
module.exports = __WRD_CREATE_PLUGIN(
  __WRD_SYNC_PLUGIN,
  __WRD_UI_EXPORTS.installUiRuntime,
  __WRD_TEMPLATE_BUNDLE
);
