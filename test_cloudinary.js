const cloudinary = require('cloudinary').v2;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'nfcschoolbe', '.env') });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log('Testing Cloudinary connection...');
console.log('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);

cloudinary.api.ping()
  .then(result => {
    console.log('✅ Cloudinary Ping Success:', result);
  })
  .catch(error => {
    console.error('❌ Cloudinary Ping Failed:');
    console.error(error);
  });
