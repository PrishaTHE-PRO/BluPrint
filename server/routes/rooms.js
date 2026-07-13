const express = require('express');
const router  = express.Router();
const Room    = require('../models/Room');

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizePoint(point) {
    return {
        x: toNumber(point && point.x),
        y: toNumber(point && point.y),
    };
}

function sanitizeLayout(layout, roomFields) {
    if (!layout || typeof layout !== 'object') return null;
    if (!Array.isArray(layout.roomPoints) || !Array.isArray(layout.elements) || !Array.isArray(layout.cutouts)) {
        return null;
    }

    return {
        version: typeof layout.version === 'number' ? layout.version : 1,
        roomId: typeof layout.roomId === 'string' ? layout.roomId : undefined,
        roomName: typeof layout.roomName === 'string' && layout.roomName.trim()
            ? layout.roomName.trim()
            : roomFields.name,
        widthFt: toNumber(layout.widthFt, roomFields.widthFt),
        lengthFt: toNumber(layout.lengthFt, roomFields.lengthFt),
        heightFt: toNumber(layout.heightFt, roomFields.heightFt),
        sqft: toNumber(layout.sqft, roomFields.sqft),
        scale: toNumber(layout.scale, 20) > 0 ? toNumber(layout.scale, 20) : 20,
        viewBox: {
            width: toNumber(layout.viewBox && layout.viewBox.width, 800) > 0
                ? toNumber(layout.viewBox && layout.viewBox.width, 800)
                : 800,
            height: toNumber(layout.viewBox && layout.viewBox.height, 500) > 0
                ? toNumber(layout.viewBox && layout.viewBox.height, 500)
                : 500,
        },
        roomPoints: layout.roomPoints.map(sanitizePoint),
        elements: layout.elements.map((element) => ({
            id: element && element.id !== undefined ? element.id : '',
            type: element && element.type === 'window' ? 'window' : 'door',
            x: toNumber(element && element.x),
            y: toNumber(element && element.y),
            angle: toNumber(element && element.angle),
        })),
        cutouts: layout.cutouts.map((cutout) => ({
            id: cutout && cutout.id !== undefined ? cutout.id : '',
            type: 'cutout',
            points: Array.isArray(cutout && cutout.points) ? cutout.points.map(sanitizePoint) : [],
        })),
        savedAt: typeof layout.savedAt === 'string' ? layout.savedAt : new Date().toISOString(),
    };
}

// POST / — save a new room
router.post('/', async (req, res) => {
    try {
        const { userId, name, layout } = req.body;
        const widthFt  = toNumber(req.body.widthFt);
        const lengthFt = toNumber(req.body.lengthFt);
        const heightFt = toNumber(req.body.heightFt, 8);
        const sqft     = widthFt * lengthFt;
        const roomFields = { name, widthFt, lengthFt, heightFt, sqft };
        const newRoom = new Room({
            userId,
            name,
            widthFt,
            lengthFt,
            heightFt,
            sqft,
            layout: sanitizeLayout(layout, roomFields),
        });
        const saved   = await newRoom.save();
        if (saved.layout && !saved.layout.roomId) {
            saved.layout = { ...saved.layout, roomId: String(saved._id) };
            await saved.save();
        }
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

// PATCH /:roomId — update room dimensions/layout
router.patch('/:roomId', async (req, res) => {
    try {
        const current = await Room.findById(req.params.roomId);
        if (!current) return res.status(404).json({ error: 'Room not found.' });

        const name     = typeof req.body.name === 'string' && req.body.name.trim() ? req.body.name.trim() : current.name;
        const widthFt  = req.body.widthFt  !== undefined ? toNumber(req.body.widthFt, current.widthFt)   : current.widthFt;
        const lengthFt = req.body.lengthFt !== undefined ? toNumber(req.body.lengthFt, current.lengthFt) : current.lengthFt;
        const heightFt = req.body.heightFt !== undefined ? toNumber(req.body.heightFt, current.heightFt) : current.heightFt;
        const sqft     = widthFt * lengthFt;
        const roomFields = { name, widthFt, lengthFt, heightFt, sqft };

        current.name     = name;
        current.widthFt  = widthFt;
        current.lengthFt = lengthFt;
        current.heightFt = heightFt;
        current.sqft     = sqft;

        if (Object.prototype.hasOwnProperty.call(req.body, 'layout')) {
            current.layout = sanitizeLayout(req.body.layout, roomFields);
        }

        const saved = await current.save();
        res.status(200).json(saved);
    } catch (error) {
        console.error('Room update error:', error.message);
        res.status(500).json({ error: 'Failed to update room.' });
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
