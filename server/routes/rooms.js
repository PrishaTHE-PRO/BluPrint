const express = require('express');
const router  = express.Router();
const Room    = require('../models/Room');
const Style   = require('../models/Style');
const { requireAuth, requireRoomOwner } = require('../middleware/auth');
const multer  = require('multer');
const { uploadToCloudinary } = require('../utils/cloudinary');
const { estimateRoom } = require('../services/roomPhotoAnalyzer');

// Every room route is owner-only. Ownership comes from the verified token, not
// from anything the client sends.
router.use(requireAuth);

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
            // Windows carry a resizable width (editor px); keep it so the preview
            // can render them at their true size.
            ...(element && element.type === 'window' && element.width != null
                ? { width: toNumber(element.width) }
                : {}),
        })),
        cutouts: layout.cutouts.map((cutout) => ({
            id: cutout && cutout.id !== undefined ? cutout.id : '',
            type: 'cutout',
            points: Array.isArray(cutout && cutout.points) ? cutout.points.map(sanitizePoint) : [],
        })),
        savedAt: typeof layout.savedAt === 'string' ? layout.savedAt : new Date().toISOString(),
    };
}

function normalizeHexColor(value) {
    if (typeof value !== 'string') return undefined;
    const raw = value.trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) {
        if (raw.length === 4) {
            return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
        }
        return raw.toLowerCase();
    }
    const rgb = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgb) {
        return `#${[rgb[1], rgb[2], rgb[3]]
            .map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0'))
            .join('')}`;
    }
    return undefined;
}

function sanitizeFurnitureItem(item) {
    const color = normalizeHexColor(item && item.color);
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
        ...(color ? { color } : {}),
    };
}

function sanitizeFurnitureLayout(layout) {
    if (!layout || typeof layout !== 'object') return null;
    if (!Array.isArray(layout.items)) return null;

    return {
        version: typeof layout.version === 'number' ? layout.version : 1,
        ...(typeof layout.styleTag === 'string' ? { styleTag: layout.styleTag } : {}),
        ...(layout.budgetTotal !== undefined
            ? { budgetTotal: Math.max(0, toNumber(layout.budgetTotal)) }
            : {}),
        ...(Array.isArray(layout.roomFeatures)
            ? {
                roomFeatures: layout.roomFeatures
                    .map((feature) => String(feature || '').trim())
                    .filter(Boolean),
            }
            : {}),
        items: layout.items
            .filter((entry) => entry && typeof entry.category === 'string' && entry.category)
            .map((entry) => {
                const item = sanitizeFurnitureItem(entry.item);
                const color = normalizeHexColor(entry && entry.color) || item.color;
                return {
                    category: entry.category,
                    hidden:   Boolean(entry.hidden),
                    x:        toNumber(entry.x),
                    y:        toNumber(entry.y),
                    rotation: toNumber(entry.rotation),
                    scale:    Math.max(0.5, Math.min(2, toNumber(entry.scale, 1))),
                    ...(color ? { color } : {}),
                    item:     color ? { ...item, color } : item,
                };
            }),
        savedAt: typeof layout.savedAt === 'string' ? layout.savedAt : new Date().toISOString(),
    };
}

// Only our own Cloudinary account is an acceptable photo source. Anything
// else in this field would be a stored URL we later fetch server-side, which
// is the SSRF the image proxy already had to close.
const PHOTO_URL_PREFIX = 'https://res.cloudinary.com/';

/**
 * Reads body.photoUrl. Absent means "leave it alone"; null means "remove";
 * a Cloudinary https URL means "set". Anything else is rejected by the caller.
 */
function readPhotoUrl(body) {
    if (!body || !Object.prototype.hasOwnProperty.call(body, 'photoUrl')) return { provided: false };
    const value = body.photoUrl;
    if (value === null) return { provided: true, value: null };
    if (typeof value === 'string' && value.startsWith(PHOTO_URL_PREFIX)) return { provided: true, value };
    return { provided: true, invalid: true };
}

function sanitizePhotoEstimate(value) {
    if (!value || typeof value !== 'object') return null;
    return {
        roomType: typeof value.roomType === 'string' ? value.roomType.slice(0, 32) : '',
        widthFt: toNumber(value.widthFt),
        lengthFt: toNumber(value.lengthFt),
        heightFt: toNumber(value.heightFt),
        existingFurniture: Array.isArray(value.existingFurniture)
            ? value.existingFurniture.map((f) => String(f || '').trim()).filter(Boolean).slice(0, 12)
            : [],
        confidence: Math.max(0, Math.min(1, toNumber(value.confidence))),
        fallback: Boolean(value.fallback),
    };
}

const photoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    fileFilter(req, file, cb) {
        cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype));
    },
});

// POST /photo-analyze: upload a room photo and estimate the room from it.
// Declared before the /:roomId routes; this router is also mounted ahead of
// the others in server/index.js, whose "/:roomId" owner check would otherwise
// read "photo-analyze" as a room id. Needs auth but no room yet: the room is
// created afterwards with the returned photoUrl.
router.post('/photo-analyze', (req, res, next) => {
    photoUpload.single('photo')(req, res, (err) => {
        if (err) {
            const message = err.code === 'LIMIT_FILE_SIZE'
                ? 'Photo must be 8 MB or smaller.'
                : 'Could not read that photo.';
            return res.status(400).json({ error: message });
        }
        next();
    });
}, async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Attach a JPEG, PNG or WebP photo in the "photo" field.' });
    }
    try {
        const photoUrl = await uploadToCloudinary(req.file.buffer, req.file.mimetype, 'bluprint/rooms');
        const estimate = await estimateRoom(photoUrl);
        res.json({ photoUrl, estimate });
    } catch (error) {
        console.error('Photo upload error:', error.message);
        res.status(502).json({ error: 'Could not upload the photo. Please try again.' });
    }
});

// POST / — save a new room
router.post('/', async (req, res) => {
    try {
        // userId comes from the verified token. It used to be read from the
        // body, which let anyone create rooms under another person's id.
        const userId = req.uid;
        const { name, layout } = req.body;
        const photo = readPhotoUrl(req.body);
        if (photo.invalid) {
            return res.status(400).json({ error: 'photoUrl must be a Cloudinary https URL or null.' });
        }
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
            photoUrl: photo.provided ? photo.value : null,
            photoEstimate: photo.provided && photo.value ? sanitizePhotoEstimate(req.body.photoEstimate) : null,
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
        // Scoped to the caller. ?userId= is ignored — honouring it was how any
        // user's room list could be read by asking for it.
        const rooms = await Room.find({ userId: req.uid })
            .sort({ createdAt: -1 })
            .lean();
        const roomIds = rooms.map((room) => room._id);
        const styles = roomIds.length
            ? await Style.find({ roomId: { $in: roomIds } }).lean()
            : [];
        // Prefer the user's picks; fall back to AI analysis so completed
        // projects still reopen on the results page.
        const stylesByRoom = new Map();
        for (const style of styles) {
            const key = String(style.roomId);
            const existing = stylesByRoom.get(key);
            if (!existing || style.source === 'user') {
                stylesByRoom.set(key, style);
            }
        }

        res.status(200).json(rooms.map((room) => ({
            ...room,
            style: stylesByRoom.get(String(room._id)) || null,
        })));
    } catch (error) {
        res.status(500).json({ error: 'Failed to get rooms.' });
    }
});

// PATCH /:roomId — update room dimensions/layout
router.patch('/:roomId', requireRoomOwner, async (req, res) => {
    try {
        const current = req.room;

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

        const photo = readPhotoUrl(req.body);
        if (photo.invalid) {
            return res.status(400).json({ error: 'photoUrl must be a Cloudinary https URL or null.' });
        }
        if (photo.provided) {
            // A render belongs to one specific photo. Removing or swapping the
            // photo leaves a picture of a room that no longer exists.
            if (photo.value !== current.photoUrl) {
                current.render = null;
                current.markModified('render');
            }
            current.photoUrl = photo.value;
            current.photoEstimate = photo.value
                ? (sanitizePhotoEstimate(req.body.photoEstimate) || current.photoEstimate || null)
                : null;
            current.markModified('photoEstimate');
        }

        const saved = await current.save();
        res.status(200).json(saved);
    } catch (error) {
        console.error('Room update error:', error.message);
        res.status(500).json({ error: 'Failed to update room.' });
    }
});

// DELETE /:roomId — remove a room
router.delete('/:roomId', requireRoomOwner, async (req, res) => {
    try {
        await Room.findByIdAndDelete(req.params.roomId);
        res.status(200).json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete room.' });
    }
});

module.exports = router;
