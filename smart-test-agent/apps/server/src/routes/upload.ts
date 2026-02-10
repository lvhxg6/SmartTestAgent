/**
 * File Upload Route Module
 * Handles multipart/form-data file uploads for source code files
 * Storage path: data/uploads/{projectId}/{category}-files/
 *
 * @see Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// ============================================================================
// Types
// ============================================================================

/** Valid upload categories */
type UploadCategory = 'route' | 'page';

/** Single file info in the upload response */
interface UploadedFileInfo {
  originalName: string;
  storagePath: string;
  size: number;
}

/** Upload endpoint response */
interface UploadResponse {
  success: true;
  files: UploadedFileInfo[];
}

/** Upload error response */
interface UploadErrorResponse {
  success: false;
  error: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Base directory for all uploads */
const UPLOAD_BASE_DIR = 'data/uploads';

/** Maximum file size in bytes (50MB) */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Valid category values */
const VALID_CATEGORIES: UploadCategory[] = ['route', 'page'];

// ============================================================================
// Multer Storage Configuration
// ============================================================================

/**
 * Custom disk storage that organizes files by projectId and category
 * Storage path: data/uploads/{projectId}/{category}-files/{originalFilename}
 */
const storage = multer.diskStorage({
  destination(
    req: Request,
    _file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void
  ) {
    const projectId = req.params.projectId;
    const category = (req.body?.category || req.query?.category || 'route') as string;

    if (!projectId) {
      return cb(new Error('Missing projectId'), '');
    }

    const destDir = path.join(UPLOAD_BASE_DIR, projectId, `${category}-files`);

    // Create directory recursively if it doesn't exist
    try {
      fs.mkdirSync(destDir, { recursive: true });
    } catch (err) {
      return cb(err as Error, '');
    }

    cb(null, destDir);
  },

  filename(
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void
  ) {
    // Use original filename to preserve meaningful names
    cb(null, file.originalname);
  },
});

/**
 * Multer instance with disk storage and size limits
 * - Single file max: 50MB
 * - Storage: organized by projectId and category
 */
const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

// ============================================================================
// Router
// ============================================================================

const uploadRouter: Router = Router();

/**
 * POST /api/upload/:projectId
 *
 * Upload files for a project, organized by category.
 *
 * @param projectId - Project identifier (URL parameter)
 * @body category - File category: "route" | "page" (form field)
 * @body files - Files to upload (multipart form field)
 *
 * @returns {UploadResponse} On success - file info with storage paths
 * @returns {UploadErrorResponse} On error - error message
 *
 * @see Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */
uploadRouter.post(
  '/:projectId',
  // Validate projectId before processing files
  (req: Request, res: Response, next: NextFunction) => {
    const { projectId } = req.params;
    if (!projectId || projectId.trim() === '') {
      res.status(400).json({
        success: false,
        error: 'Missing required parameter: projectId',
      } as UploadErrorResponse);
      return;
    }
    next();
  },
  // Process file upload with multer
  upload.array('files', 20),
  // Handle successful upload
  (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No files uploaded',
      } as UploadErrorResponse);
      return;
    }

    const fileInfos: UploadedFileInfo[] = files.map((file) => ({
      originalName: file.originalname,
      storagePath: file.path,
      size: file.size,
    }));

    res.json({
      success: true,
      files: fileInfos,
    } as UploadResponse);
  }
);

// ============================================================================
// Error Handling Middleware
// ============================================================================

/**
 * Multer error handler
 * Converts multer-specific errors to appropriate HTTP responses
 */
uploadRouter.use(
  (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          success: false,
          error: 'File too large. Maximum file size is 50MB.',
        } as UploadErrorResponse);
        return;
      }
      // Other multer errors
      res.status(400).json({
        success: false,
        error: `Upload error: ${err.message}`,
      } as UploadErrorResponse);
      return;
    }

    // Generic errors
    console.error('[Upload Error]', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error during file upload',
    } as UploadErrorResponse);
  }
);

// ============================================================================
// Exports
// ============================================================================

export { uploadRouter, UPLOAD_BASE_DIR, MAX_FILE_SIZE, VALID_CATEGORIES };
export type { UploadCategory, UploadedFileInfo, UploadResponse, UploadErrorResponse };
