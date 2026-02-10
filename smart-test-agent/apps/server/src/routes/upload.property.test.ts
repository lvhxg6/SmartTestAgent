/**
 * Property-Based Tests for Upload Endpoint
 * Feature: mvp-config-simplify, Property 4: Upload endpoint stores files and returns correct paths
 *
 * **Validates: Requirements 2.5, 3.2, 3.3**
 *
 * For any valid projectId and set of uploaded files, the upload endpoint should store
 * each file under `data/uploads/{projectId}/{category}-files/` and return a response
 * containing one entry per uploaded file with the correct storage path.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import express from 'express';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { uploadRouter, UPLOAD_BASE_DIR } from './upload.js';

// ============================================================================
// Test Helpers (reused patterns from upload.test.ts)
// ============================================================================

/**
 * Create a minimal Express app with the upload router mounted
 */
function createTestApp() {
  const app = express();
  app.use('/api/upload', uploadRouter);
  return app;
}

/**
 * Build a multipart/form-data request body manually (no external deps needed)
 */
function buildMultipartBody(
  boundary: string,
  fields: { name: string; value: string }[],
  files: { fieldName: string; filename: string; content: string; contentType?: string }[]
): Buffer {
  const parts: string[] = [];

  for (const field of fields) {
    parts.push(`--${boundary}\r\n`);
    parts.push(`Content-Disposition: form-data; name="${field.name}"\r\n\r\n`);
    parts.push(`${field.value}\r\n`);
  }

  for (const file of files) {
    parts.push(`--${boundary}\r\n`);
    parts.push(
      `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\n`
    );
    parts.push(`Content-Type: ${file.contentType || 'application/octet-stream'}\r\n\r\n`);
    parts.push(`${file.content}\r\n`);
  }

  parts.push(`--${boundary}--\r\n`);
  return Buffer.from(parts.join(''));
}

/**
 * Send an HTTP request to the test server and return the response
 */
function sendRequest(
  server: http.Server,
  options: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: Buffer;
  }
): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path: options.path,
        method: options.method,
        headers: options.headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let body: any;
          try {
            body = JSON.parse(data);
          } catch {
            body = data;
          }
          resolve({ statusCode: res.statusCode || 0, body });
        });
      }
    );
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// ============================================================================
// Generators
// ============================================================================

/**
 * Generator for valid projectId strings.
 * ProjectIds are alphanumeric with hyphens, similar to UUIDs or slug-like identifiers.
 */
const projectIdArb = fc
  .stringOf(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')
    ),
    { minLength: 1, maxLength: 30 }
  )
  .map((s) => `pbt-${s}`); // prefix to isolate from other tests

/**
 * Generator for valid filenames.
 * Filenames use alphanumeric chars, hyphens, underscores, and common extensions.
 */
const filenameArb = fc
  .tuple(
    fc.stringOf(
      fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'.split('')
      ),
      { minLength: 1, maxLength: 20 }
    ),
    fc.constantFrom('.ts', '.tsx', '.js', '.jsx', '.vue', '.zip')
  )
  .map(([name, ext]) => `${name}${ext}`);

/**
 * Generator for file content strings.
 */
const fileContentArb = fc.stringOf(
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 {}()[];=\n'.split('')
  ),
  { minLength: 1, maxLength: 200 }
);

/**
 * Generator for upload category.
 */
const categoryArb = fc.constantFrom('route', 'page');

/**
 * Generator for a single file upload entry.
 */
const fileEntryArb = fc.record({
  filename: filenameArb,
  content: fileContentArb,
});

/**
 * Generator for a set of files to upload (1-3 files with unique names).
 */
const fileSetArb = fc
  .array(fileEntryArb, { minLength: 1, maxLength: 3 })
  .map((files) => {
    // Ensure unique filenames by appending index if needed
    const seen = new Set<string>();
    return files.map((f, i) => {
      let name = f.filename;
      if (seen.has(name)) {
        const ext = path.extname(name);
        const base = path.basename(name, ext);
        name = `${base}_${i}${ext}`;
      }
      seen.add(name);
      return { ...f, filename: name };
    });
  });

// ============================================================================
// Test Suite
// ============================================================================

describe('Property 4: Upload endpoint stores files and returns correct paths', () => {
  // Feature: mvp-config-simplify, Property 4: Upload endpoint stores files and returns correct paths
  // **Validates: Requirements 2.5, 3.2, 3.3**

  let server: http.Server;
  const createdDirs: string[] = [];

  beforeEach(async () => {
    const app = createTestApp();
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
  });

  afterEach(async () => {
    // Close the server
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    // Clean up all created upload directories
    for (const dir of createdDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    createdDirs.length = 0;
  });

  it('should store each uploaded file under data/uploads/{projectId}/{category}-files/ and return one entry per file', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectIdArb,
        categoryArb,
        fileSetArb,
        async (projectId, category, files) => {
          // Track directory for cleanup
          const projectDir = path.join(UPLOAD_BASE_DIR, projectId);
          createdDirs.push(projectDir);

          const boundary = `----PBTBoundary${Date.now()}${Math.random()}`;
          const body = buildMultipartBody(
            boundary,
            [{ name: 'category', value: category }],
            files.map((f) => ({
              fieldName: 'files',
              filename: f.filename,
              content: f.content,
              contentType: 'text/plain',
            }))
          );

          const res = await sendRequest(server, {
            method: 'POST',
            path: `/api/upload/${projectId}`,
            headers: {
              'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            body,
          });

          // Property: response should be successful
          expect(res.statusCode).toBe(200);
          expect(res.body.success).toBe(true);

          // Property: response should contain one entry per uploaded file
          expect(res.body.files).toHaveLength(files.length);

          // Property: each file entry should have correct fields
          for (let i = 0; i < files.length; i++) {
            const uploadedFile = files[i];
            const responseFile = res.body.files.find(
              (f: any) => f.originalName === uploadedFile.filename
            );

            // Each uploaded file must appear in the response
            expect(responseFile).toBeDefined();

            // originalName must match
            expect(responseFile.originalName).toBe(uploadedFile.filename);

            // storagePath must contain projectId and category
            expect(responseFile.storagePath).toContain(projectId);
            expect(responseFile.storagePath).toContain(`${category}-files`);
            expect(responseFile.storagePath).toContain(uploadedFile.filename);

            // size must be a positive number
            expect(typeof responseFile.size).toBe('number');
            expect(responseFile.size).toBeGreaterThan(0);
          }

          // Property: files should actually exist on disk at the expected paths
          const expectedDir = path.join(UPLOAD_BASE_DIR, projectId, `${category}-files`);
          for (const uploadedFile of files) {
            const filePath = path.join(expectedDir, uploadedFile.filename);
            expect(fs.existsSync(filePath)).toBe(true);

            // Verify file content matches what was uploaded
            const storedContent = fs.readFileSync(filePath, 'utf-8');
            expect(storedContent).toBe(uploadedFile.content);
          }

          // Cleanup this iteration's files to avoid cross-iteration interference
          if (fs.existsSync(projectDir)) {
            fs.rmSync(projectDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should isolate files by projectId — different projectIds should not share storage directories', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectIdArb,
        projectIdArb,
        categoryArb,
        fileEntryArb,
        async (projectId1, projectId2, category, file) => {
          // Skip if projectIds are the same (not interesting for isolation test)
          fc.pre(projectId1 !== projectId2);

          const projectDir1 = path.join(UPLOAD_BASE_DIR, projectId1);
          const projectDir2 = path.join(UPLOAD_BASE_DIR, projectId2);
          createdDirs.push(projectDir1, projectDir2);

          const boundary1 = `----PBTBoundary1${Date.now()}${Math.random()}`;
          const body1 = buildMultipartBody(
            boundary1,
            [{ name: 'category', value: category }],
            [{ fieldName: 'files', filename: file.filename, content: file.content, contentType: 'text/plain' }]
          );

          // Upload to projectId1
          const res1 = await sendRequest(server, {
            method: 'POST',
            path: `/api/upload/${projectId1}`,
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary1}` },
            body: body1,
          });

          expect(res1.statusCode).toBe(200);

          // Property: file should exist under projectId1's directory
          const dir1 = path.join(UPLOAD_BASE_DIR, projectId1, `${category}-files`);
          expect(fs.existsSync(path.join(dir1, file.filename))).toBe(true);

          // Property: file should NOT exist under projectId2's directory
          const dir2 = path.join(UPLOAD_BASE_DIR, projectId2, `${category}-files`);
          expect(fs.existsSync(path.join(dir2, file.filename))).toBe(false);

          // Cleanup
          if (fs.existsSync(projectDir1)) {
            fs.rmSync(projectDir1, { recursive: true, force: true });
          }
          if (fs.existsSync(projectDir2)) {
            fs.rmSync(projectDir2, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return storagePath that matches the actual file location on disk', async () => {
    await fc.assert(
      fc.asyncProperty(
        projectIdArb,
        categoryArb,
        fileEntryArb,
        async (projectId, category, file) => {
          const projectDir = path.join(UPLOAD_BASE_DIR, projectId);
          createdDirs.push(projectDir);

          const boundary = `----PBTBoundary${Date.now()}${Math.random()}`;
          const body = buildMultipartBody(
            boundary,
            [{ name: 'category', value: category }],
            [{ fieldName: 'files', filename: file.filename, content: file.content, contentType: 'text/plain' }]
          );

          const res = await sendRequest(server, {
            method: 'POST',
            path: `/api/upload/${projectId}`,
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
            body,
          });

          expect(res.statusCode).toBe(200);
          expect(res.body.files).toHaveLength(1);

          const responseFile = res.body.files[0];

          // Property: the storagePath returned in the response should be a real file on disk
          expect(fs.existsSync(responseFile.storagePath)).toBe(true);

          // Property: reading from storagePath should give us the original content
          const content = fs.readFileSync(responseFile.storagePath, 'utf-8');
          expect(content).toBe(file.content);

          // Property: storagePath should follow the pattern data/uploads/{projectId}/{category}-files/{filename}
          const expectedPathPattern = path.join(
            UPLOAD_BASE_DIR,
            projectId,
            `${category}-files`,
            file.filename
          );
          expect(responseFile.storagePath).toBe(expectedPathPattern);

          // Cleanup
          if (fs.existsSync(projectDir)) {
            fs.rmSync(projectDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
