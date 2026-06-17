const express = require('express');
const router  = express.Router();
const Room    = require('../models/Room');

// POST / — save a new room
router.post('/', async (req, res) => {
    try {
        const { userId, name, widthFt, lengthFt, heightFt } = req.body;
        const sqft    = widthFt * lengthFt;
        const newRoom = new Room({ userId, name, widthFt, lengthFt, heightFt, sqft });
        const saved   = await newRoom.save();
        res.status(201).json(saved);
    } catch (error) {
        console.error('Room save error:', error.message);
        res.status(500).json({ error: 'Failed to save room.' });
    }
});

// GET / — fetch all rooms for a user
router.get('/', async (req, res) => {
    try {
        const rooms = await Room.find({ userId: req.query.userId }).sort({ createdAt: -1 });
        res.status(200).json(rooms);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get rooms.' });
    }
});

// DELETE /:roomId — remove a room
router.delete('/:roomId', async (req, res) => {
    try {
        await Room.findByIdAndDelete(req.params.roomId);
        res.status(200).json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete room.' });
    }
});

module.exports = router;
