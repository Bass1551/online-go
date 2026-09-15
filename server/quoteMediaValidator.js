/**
 * Media Validation & SSRF Protection Engine for Thai Quote Game
 * Inspects binary magic numbers, headers, sizes, and protects against path traversal / SSRF.
 */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

// Disallowed private/loopback IP patterns for SSRF protection
const PRIVATE_IP_REGEX = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|::1|fc00:.*|fe80:.*)$/i;

const ALLOWED_EXTERNAL_HOSTS = [
  'storage.googleapis.com',
  'cdn.jsdelivr.net',
  'github.com',
  'raw.githubusercontent.com',
  'cloudflare-ipfs.com'
];

class QuoteMediaValidator {
  /**
   * Validate a single media path or URL
   */
  static validateMedia(mediaPathOrUrl, expectedType = 'video') {
    if (!mediaPathOrUrl || typeof mediaPathOrUrl !== 'string') {
      return { valid: false, error: 'Media path is missing or invalid' };
    }

    const trimmed = mediaPathOrUrl.trim();

    // Check if external URL
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return this.validateExternalUrl(trimmed);
    }

    // Local file validation
    return this.validateLocalFile(trimmed, expectedType);
  }

  /**
   * Check path traversal and binary headers of local file
   */
  static validateLocalFile(relativePath, expectedType) {
    // 1. Path traversal protection
    const sanitized = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    const resolvedPath = path.resolve(PUBLIC_DIR, sanitized);

    if (!resolvedPath.startsWith(PUBLIC_DIR)) {
      return { valid: false, error: 'Path traversal attempt detected' };
    }

    // 2. Existence check
    if (!fs.existsSync(resolvedPath)) {
      return { valid: false, error: `File does not exist: ${sanitized}` };
    }

    // 3. Stat & size check (min 10KB to ensure genuine media clip)
    let stats;
    try {
      stats = fs.statSync(resolvedPath);
    } catch (e) {
      return { valid: false, error: `Cannot read file stat: ${e.message}` };
    }

    if (!stats.isFile()) {
      return { valid: false, error: 'Target path is not a file' };
    }

    if (stats.size < 10240) {
      return { valid: false, error: `File size too small (${stats.size} bytes < 10KB) - incomplete or placeholder file` };
    }

    // 4. Binary Header / Magic numbers check
    let fd;
    try {
      fd = fs.openSync(resolvedPath, 'r');
      const headerBuf = Buffer.alloc(64);
      const bytesRead = fs.readSync(fd, headerBuf, 0, 64, 0);
      fs.closeSync(fd);

      if (bytesRead < 16) {
        return { valid: false, error: 'File header too short' };
      }

      if (expectedType === 'video') {
        // MP4 magic check: should contain 'ftyp' in bytes 4-12
        const isMp4 = headerBuf.toString('ascii', 4, 8) === 'ftyp' ||
                      headerBuf.toString('ascii', 4, 12).includes('ftyp');
        if (!isMp4) {
          return { valid: false, error: 'Invalid video container (missing MP4 ftyp marker)' };
        }
      } else if (expectedType === 'audio') {
        // MP3 check: ID3 tag or frame sync 0xFF 0xFB/F3/F2 or RIFF/WAV
        const isId3 = headerBuf.toString('ascii', 0, 3) === 'ID3';
        const isRiff = headerBuf.toString('ascii', 0, 4) === 'RIFF';
        const isMpegSync = (headerBuf[0] === 0xFF && (headerBuf[1] & 0xE0) === 0xE0);

        if (!isId3 && !isRiff && !isMpegSync) {
          return { valid: false, error: 'Invalid audio format (missing ID3/MPEG sync/RIFF marker)' };
        }
      }
    } catch (err) {
      if (fd) {
        try { fs.closeSync(fd); } catch (e) {}
      }
      return { valid: false, error: `Error inspecting binary file: ${err.message}` };
    }

    return { valid: true, resolvedPath, size: stats.size };
  }

  /**
   * SSRF and domain allowlist validation for external URLs
   */
  static validateExternalUrl(urlString) {
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch (e) {
      return { valid: false, error: 'Invalid URL format' };
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, error: 'Only HTTP/HTTPS URLs are supported' };
    }

    const host = parsed.hostname.toLowerCase();

    // Check for loopback / private ranges
    if (PRIVATE_IP_REGEX.test(host)) {
      return { valid: false, error: 'External URL targets private/internal network (SSRF blocked)' };
    }

    // Check domain allowlist
    const isAllowed = ALLOWED_EXTERNAL_HOSTS.some(allowed => host === allowed || host.endsWith('.' + allowed));
    if (!isAllowed) {
      return { valid: false, error: `External domain ${host} is not in trusted media allowlist` };
    }

    return { valid: true, url: urlString };
  }

  /**
   * Comprehensive validation for question publishing
   */
  static validateQuestionForPublish(q) {
    const errors = [];

    if (!q.title || !q.title.trim()) errors.push('Title is required');
    if (!q.character || !q.character.trim()) errors.push('Character is required');
    if (!q.correctAnswer || !q.correctAnswer.trim()) errors.push('Correct answer is required');
    if (!Array.isArray(q.options) || q.options.length !== 4) errors.push('Exactly 4 options are required');
    if (typeof q.clipDuration !== 'number' || q.clipDuration <= 0) errors.push('Valid clipDuration is required');

    // Check 4 required media files
    const iv = this.validateMedia(q.introVideoUrl, 'video');
    if (!iv.valid) errors.push(`Intro video error: ${iv.error}`);

    const qv = this.validateMedia(q.quoteVideoUrl, 'video');
    if (!qv.valid) errors.push(`Quote video error: ${qv.error}`);

    const qa = this.validateMedia(q.quoteAudioUrl, 'audio');
    if (!qa.valid) errors.push(`Quote audio error: ${qa.error}`);

    const ia = this.validateMedia(q.introAudioUrl || q.audioUrl, 'audio');
    if (!ia.valid) errors.push(`Intro audio error: ${ia.error}`);

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = QuoteMediaValidator;
