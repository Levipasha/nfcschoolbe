const mongoose = require('mongoose');

const schoolClassSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
            index: true
        },
        name: {
            type: String,
            required: [true, 'Class name is required'],
            trim: true,
            maxlength: [80, 'Class name cannot exceed 80 characters']
        },
        sortOrder: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

schoolClassSchema.index({ school: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('SchoolClass', schoolClassSchema);
