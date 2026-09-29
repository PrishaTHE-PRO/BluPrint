// cloudinary.js: one configured client and one upload helper.
//
// Lived inline in routes/inspo.js until the room photo and render routes
// needed the same stream upload. Three copies of a config block is how a
// credential rename ends up half-applied, so the routes share this instead.

const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Streams a buffer to Cloudinary and resolves the https URL.
 * `mimetype` is accepted for call-site symmetry; Cloudinary sniffs the bytes.
 */
function uploadToCloudinary(buffer, mimetype, folder = "bluprint") {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "image", folder },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

module.exports = { cloudinary, uploadToCloudinary };
