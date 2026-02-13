const mongoose = require('mongoose');
const School = require('./models/School');
require('dotenv').config();

const createDefaultSchool = async () => {
    try {
        // Connect to database
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('📡 Connected to MongoDB');

        // Check if any schools exist
        const existingSchools = await School.countDocuments();

        if (existingSchools > 0) {
            console.log(`✅ ${existingSchools} school(s) already exist`);
            console.log('');
            console.log('📋 Existing schools:');
            const schools = await School.find({}).select('name code schoolId');
            schools.forEach(school => {
                console.log(`   - ${school.name} (Code:${school.code}, ID: ${school.schoolId})`);
            });
            process.exit(0);
        }

        // Create default school - let the pre-save hook generate code and ID
        console.log('Creating default school...');

        const defaultSchool = new School({
            name: 'Default School'
        });

        await defaultSchool.save();

        console.log('');
        console.log('✅ Default school created successfully!');
        console.log(`   School Name: ${defaultSchool.name}`);
        console.log(`   School Code: ${defaultSchool.code}`);
        console.log(`   School ID: ${defaultSchool.schoolId}`);
        console.log('');
        console.log('📝 Next steps:');
        console.log('   1. Go to http://localhost:5173/admin/schools');
        console.log('   2. Create your actual schools (e.g., "SV Model High School")');
        console.log(`   3. Or use this default school (students will have IDs like: ${defaultSchool.code}-01)`);
        console.log('');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating default school:', error.message);
        console.error('');
        console.error('Details:', error);
        process.exit(1);
    }
};

createDefaultSchool();
