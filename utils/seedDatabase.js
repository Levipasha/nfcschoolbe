require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('../models/Student');
const connectDB = require('../config/database');

// Sample student data
const generateSampleStudents = (count = 50) => {
    const classes = ['1-A', '1-B', '2-A', '2-B', '3-A', '3-B', '4-A', '4-B', '5-A', '5-B',
        '6-A', '6-B', '7-A', '7-B', '8-A', '8-B', '9-A', '9-B', '10-A', '10-B'];

    const firstNames = ['Rahul', 'Priya', 'Amit', 'Sneha', 'Arjun', 'Ananya', 'Rohan', 'Diya',
        'Karan', 'Ishita', 'Vikram', 'Riya', 'Aditya', 'Kavya', 'Nikhil',
        'Pooja', 'Sanjay', 'Meera', 'Harsh', 'Nisha'];

    const lastNames = ['Sharma', 'Patel', 'Kumar', 'Singh', 'Gupta', 'Reddy', 'Verma', 'Joshi',
        'Mehta', 'Nair', 'Rao', 'Desai', 'Iyer', 'Bhat', 'Pillai'];

    const students = [];

    for (let i = 1; i <= count; i++) {
        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        const studentName = `${firstName} ${lastName}`;
        const parentName = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastName}`;

        students.push({
            name: studentName,
            rollNumber: `2024${String(i).padStart(4, '0')}`,
            class: classes[Math.floor(Math.random() * classes.length)],
            photo: `https://api.dicebear.com/7.x/avataaars/svg?seed=${studentName.replace(' ', '')}`,
            parentName: parentName,
            parentPhone: `+91 ${Math.floor(Math.random() * 9000000000) + 1000000000}`,
            emergencyContact: `+91 ${Math.floor(Math.random() * 9000000000) + 1000000000}`,
            isActive: true
        });
    }

    return students;
};

const seedDatabase = async () => {
    try {
        // Connect to database
        await connectDB();

        console.log('🌱 Starting database seeding...');

        // Clear existing students
        await Student.deleteMany({});
        console.log('✅ Cleared existing students');

        // Generate and insert students
        const sampleStudents = generateSampleStudents(50);
        const insertedStudents = await Student.insertMany(sampleStudents);

        console.log(`✅ Successfully seeded ${insertedStudents.length} students`);

        // Display first 5 students with their NFC URLs
        console.log('\n📋 Sample Students:');
        console.log('===================\n');

        insertedStudents.slice(0, 5).forEach((student, index) => {
            console.log(`${index + 1}. ${student.name}`);
            console.log(`   Roll Number: ${student.rollNumber}`);
            console.log(`   Class: ${student.class}`);
            console.log(`   Student ID: ${student.studentId}`);
            console.log(`   NFC URL: ${student.generateNFCUrl(process.env.FRONTEND_URL || 'http://localhost:5173')}`);
            console.log('');
        });

        console.log('✅ Database seeding completed successfully!');
        console.log('\n💡 Tips:');
        console.log('   - Use the Student IDs above to test the frontend');
        console.log('   - Login to admin panel with credentials from .env file');
        console.log('   - You can run this script again to reset the database\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    }
};

// Run the seeder
seedDatabase();
