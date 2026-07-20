const mongoose = require('mongoose');

// This is our blueprint for a Room index card!
const RoomSchema = new mongoose.Schema({
    userId: { type: String, required: true },   // Who owns this room?
    name: { type: String, required: true },     // What is it called?
    widthFt: { type: Number, required: true },  // How wide is it?
    lengthFt: { type: Number, required: true }, // How long is it?
    heightFt: { type: Number, required: true }, // How tall is it?
    sqft: { type: Number, required: true },     // Total floor space!
    layout: { type: mongoose.Schema.Types.Mixed, default: null }, // 2D room preview snapshot
    budgetTotal: { type: Number },              // Furnishing budget in dollars (optional)
    // Where the user placed each furniture piece, which ones they removed, and
    // which product they swapped in. Stores full items, not search ids — those
    // are positional and change between searches.
    furnitureLayout: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true }); // This automatically adds the date it was made!

module.exports = mongoose.model('Room', RoomSchema);
