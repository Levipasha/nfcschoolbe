const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Create indexes for optimized queries
    await createIndexes();
  } catch (error) {
    console.error(`❌ Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

const createIndexes = async () => {
  try {
    const Student = require('../models/Student');
    
    // Create index on studentId for fast lookups
    await Student.collection.createIndex({ studentId: 1 }, { unique: true });
    
    // Create index on rollNumber
    await Student.collection.createIndex({ rollNumber: 1 });
    
    // Create index for active students
    await Student.collection.createIndex({ isActive: 1 });
    
    console.log('✅ Database indexes created successfully');
  } catch (error) {
    console.error('⚠️  Index creation error:', error.message);
  }
};

module.exports = connectDB;
