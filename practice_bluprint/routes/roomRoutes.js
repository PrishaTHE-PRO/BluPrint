const express = require('express');
const router = express.Router();
const Room = require('../models/Room'); // This grabs our blueprint file!

// 1. This tells the waiter how to SAVE a room
router.post('/api/rooms', async (req, res) => {
    try {
        const { userId, name, widthFt, lengthFt, heightFt } = req.body;

        // Live calculation: Width x Length = Square Footage!
        const sqft = widthFt * lengthFt;

        // Create the room document
        const newRoom = new Room({ userId, name, widthFt, lengthFt, heightFt, sqft });

        // Save it to MongoDB
        const savedRoom = await newRoom.save();
        res.status(201).json(savedRoom);
    } catch (error) {
        res.status(500).json({ error: 'Failed to save room.' });
    }
});

// 2. This tells the waiter how to FETCH all rooms for a user
router.get('/api/rooms', async (req, res) => {
    try {
        const { userId } = req.query;
        const rooms = await Room.find({ userId }).sort({ createdAt: -1 });
        res.status(200).json(rooms);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get rooms.' });
    }
});

module.exports = router;