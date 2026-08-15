const multer = require('multer');
const path = require('path');
const config = require('../config');

const ALLOWED_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function makeUploader({ maxBytes, imageOnly = false } = {}) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes || config.maxUploadBytes },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const ok = imageOnly ? IMAGE_EXT.has(ext) : ALLOWED_EXT.has(ext);
      if (!ok) return cb(new Error('File type not allowed'));
      return cb(null, true);
    },
  });
}

const uploadDoc = makeUploader();
const uploadBrochure = makeUploader({ maxBytes: config.maxBrochurePdfBytes });
const uploadAvatar = makeUploader({ maxBytes: 2 * 1024 * 1024, imageOnly: true });
const uploadEventImage = makeUploader({ maxBytes: 2 * 1024 * 1024, imageOnly: true });

/** Run multer only for multipart requests so JSON PUT/POST still works. */
function optionalFile(uploader) {
  return (req, res, next) => {
    const ct = String(req.headers['content-type'] || '');
    if (ct.includes('multipart/form-data')) {
      return uploader.single('file')(req, res, next);
    }
    return next();
  };
}

module.exports = {
  uploadDoc,
  uploadBrochure,
  uploadAvatar,
  uploadEventImage,
  optionalFile,
  ALLOWED_EXT,
};
