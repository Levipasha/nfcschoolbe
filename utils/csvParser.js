// Normalize column names to handle variations
const normalizeColumnName = (header) => {
    // Remove spaces, convert to lowercase, handle common variations
    const normalized = header.trim().toLowerCase().replace(/\s+/g, '');

    // Map common variations to standard names
    const mappings = {
        'studentname': 'name',
        'student': 'name',
        'fullname': 'name',
        'name': 'name',
        'rollno': 'rollnumber',
        'roll': 'rollnumber',
        'rollnumber': 'rollnumber',
        'class': 'class',
        'grade': 'class',
        'section': 'class',
        'photo': 'photo',
        'photourl': 'photo',
        'image': 'photo',
        'imageurl': 'photo',
        'parentname': 'parentname',
        'parent': 'parentname',
        'guardian': 'parentname',
        'guardianname': 'parentname',
        'parentnan': 'parentname',
        'parentphone': 'parentphone',
        'parentnumber': 'parentphone',
        'parentcontact': 'parentphone',
        'guardianphone': 'parentphone',
        'parentpho': 'parentphone',
        'emergencycontact': 'emergencycontact',
        'emergency': 'emergencycontact',
        'emergencynumber': 'emergencycontact',
        'emergencyphone': 'emergencycontact',
        'alternatecontact': 'emergencycontact'
    };

    return mappings[normalized] || normalized;
};

const parseCSV = (fileContent, schoolCode, schoolId) => {
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');

    if (lines.length < 2) {
        throw new Error('File must contain header row and at least one student');
    }

    // Parse header and normalize column names
    const rawHeaders = lines[0].split(',').map(h => h.trim());
    const headers = rawHeaders.map(h => normalizeColumnName(h));

    // Validate required headers
    const requiredHeaders = ['name', 'rollnumber', 'class', 'parentname', 'parentphone', 'emergencycontact'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

    if (missingHeaders.length > 0) {
        throw new Error(`Missing required columns: ${missingHeaders.join(', ')}. Your file has: ${rawHeaders.join(', ')}`);
    }

    // Parse student data
    const students = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(',').map(v => v.trim());

        if (values.length !== headers.length) {
            errors.push(`Line ${i + 1}: Column count mismatch (expected ${headers.length}, got ${values.length})`);
            continue;
        }

        const student = {};
        headers.forEach((header, index) => {
            student[header] = values[index];
        });

        // Validation
        const studentErrors = [];

        if (!student.name || student.name.length === 0) {
            studentErrors.push('Name is required');
        }

        if (!student.rollnumber || student.rollnumber.length === 0) {
            studentErrors.push('Roll number is required');
        }

        if (!student.class || student.class.length === 0) {
            studentErrors.push('Class is required');
        }

        if (!student.parentname || student.parentname.length === 0) {
            studentErrors.push('Parent name is required');
        }

        if (!student.parentphone || student.parentphone.length === 0) {
            studentErrors.push('Parent phone is required');
        }

        if (!student.emergencycontact || student.emergencycontact.length === 0) {
            studentErrors.push('Emergency contact is required');
        }

        if (studentErrors.length > 0) {
            errors.push(`Line ${i + 1}: ${studentErrors.join(', ')}`);
            continue;
        }

        // Map to database schema with school info
        students.push({
            name: student.name,
            rollNumber: student.rollnumber,
            class: student.class,
            photo: student.photo || '',
            parentName: student.parentname,
            parentPhone: student.parentphone,
            emergencyContact: student.emergencycontact,
            school: schoolId,
            schoolCode: schoolCode
        });
    }

    return { students, errors };
};

const parseTXT = (fileContent, schoolCode, schoolId) => {
    // Support tab-separated or pipe-separated values
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');

    if (lines.length < 2) {
        throw new Error('File must contain header row and at least one student');
    }

    // Detect separator (tab or pipe)
    const firstLine = lines[0];
    const separator = firstLine.includes('\t') ? '\t' : (firstLine.includes('|') ? '|' : ',');

    // Parse header and normalize column names
    const rawHeaders = lines[0].split(separator).map(h => h.trim());
    const headers = rawHeaders.map(h => normalizeColumnName(h));

    // Validate required headers
    const requiredHeaders = ['name', 'rollnumber', 'class', 'parentname', 'parentphone', 'emergencycontact'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

    if (missingHeaders.length > 0) {
        throw new Error(`Missing required columns: ${missingHeaders.join(', ')}. Your file has: ${rawHeaders.join(', ')}`);
    }

    // Parse student data
    const students = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(separator).map(v => v.trim());

        const student = {};
        headers.forEach((header, index) => {
            student[header] = values[index] || '';
        });

        // Validation
        const studentErrors = [];

        if (!student.name) studentErrors.push('Name is required');
        if (!student.rollnumber) studentErrors.push('Roll number is required');
        if (!student.class) studentErrors.push('Class is required');
        if (!student.parentname) studentErrors.push('Parent name is required');
        if (!student.parentphone) studentErrors.push('Parent phone is required');
        if (!student.emergencycontact) studentErrors.push('Emergency contact is required');

        if (studentErrors.length > 0) {
            errors.push(`Line ${i + 1}: ${studentErrors.join(', ')}`);
            continue;
        }

        // Map to database schema with school info
        students.push({
            name: student.name,
            rollNumber: student.rollnumber,
            class: student.class,
            photo: student.photo || '',
            parentName: student.parentname,
            parentPhone: student.parentphone,
            emergencyContact: student.emergencycontact,
            school: schoolId,
            schoolCode: schoolCode
        });
    }

    return { students, errors };
};

module.exports = {
    parseCSV,
    parseTXT
};
