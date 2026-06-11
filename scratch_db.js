const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const Artist = require('./models/Artist');

async function test() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!');

    console.log('Querying Artist wvb...');
    const artist = await Artist.findOne({ artistId: 'wvb' });
    console.log('Artist wvb:', artist);

    await mongoose.disconnect();
    console.log('Disconnected.');
  } catch (err) {
    console.error(err);
  }
}

test();
