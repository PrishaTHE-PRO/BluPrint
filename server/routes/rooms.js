const express = require('express');
const router  = express.Router();
const Room    = require('../models/Room');
const Style   = require('../models/Style');

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

function sanitizeFurnitureItem(item) {
    return {
        id:       item && item.id !== undefined ? String(item.id) : '',
        name:     item && typeof item.name === 'string' ? item.name : '',
        category: item && typeof item.category === 'string' ? item.category : '',
        brand:    item && typeof item.brand === 'string' ? item.brand : '',
        price:    toNumber(item && item.price),
        imageUrl: item && typeof item.imageUrl === 'string' ? item.imageUrl : '',
        buyUrl:   item && typeof item.buyUrl === 'string' ? item.buyUrl : '',
        widthIn:  item && item.widthIn !== undefined ? toNumber(item.widthIn) : undefined,
        depthIn:  item && item.depthIn !== undefined ? toNumber(item.depthIn) : undefined,
    };
}

function sanitizeFurnitureLayout(layout) {
    if (!layout || typeof layout !== 'object') return null;
    if (!Array.isArray(layout.items)) return null;

    return {
        version: typeof layout.version === 'number' ? layout.version : 1,
        items: layout.items
            .filter((entry) => entry && typeof entry.category === 'string' && entry.category)
            .map((entry) => ({
                category: entry.category,
                hidden:   Boolean(entry.hidden),
                x:        toNumber(entry.x),
                y:        toNumber(entry.y),
                rotation: toNumber(entry.rotation),
                item:     sanitizeFurnitureItem(entry.item),
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
        const rooms = await Room.find({ userId: req.query.userId })
            .sort({ createdAt: -1 })
            .lean();
        const roomIds = rooms.map((room) => room._id);
        const styles = roomIds.length
            ? await Style.find({ roomId: { $in: roomIds }, source: 'user' }).lean()
            : [];
        const stylesByRoom = new Map(styles.map((style) => [String(style.roomId), style]));

        res.status(200).json(rooms.map((room) => ({
            ...room,
            style: stylesByRoom.get(String(room._id)) || null,
        })));
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

        if (Object.prototype.hasOwnProperty.call(req.body, 'furnitureLayout')) {
            current.furnitureLayout = sanitizeFurnitureLayout(req.body.furnitureLayout);
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
