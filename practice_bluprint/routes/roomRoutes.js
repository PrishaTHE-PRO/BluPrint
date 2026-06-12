const express = require('express');
const router = express.Router();
const Room = require('../models/Room');

// POST / — save a new room
router.post('/', async (req, res) => {
    try {
        const { userId, name, widthFt, lengthFt, heightFt } = req.body;
        const sqft = widthFt * lengthFt;
        const newRoom = new Room({ userId, name, widthFt, lengthFt, heightFt, sqft });
        const savedRoom = await newRoom.save();
        res.status(201).json(savedRoom);
    } catch (error) {
        res.status(500).json({ error: 'Failed to save room.' });
    }
});

// GET / — fetch all rooms for a user
router.get('/', async (req, res) => {
    try {
        const { userId } = req.query;
        const rooms = await Room.find({ userId }).sort({ createdAt: -1 });
        res.status(200).json(rooms);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get rooms.' });
    }
});

module.exports = router;
